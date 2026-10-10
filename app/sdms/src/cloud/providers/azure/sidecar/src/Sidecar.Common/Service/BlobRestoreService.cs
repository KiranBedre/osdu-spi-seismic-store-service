// ============================================================================
// Copyright 2026, Microsoft
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

namespace Sidecar.Common.Service;

using System.Text.Json;
using Azure.Core;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Exceptions;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;
using System.Diagnostics;

/// <summary>
/// Implements storage restore operations for dataset restoration.
/// Handles:
/// - Restoring the dataset's blob range using storage-account PITR
/// - Validating consistency between metadata-referenced blobs and storage state
/// </summary>
public class BlobRestoreService(
    ILogger<BlobRestoreService> logger,
    IBlobClientFactory blobClientFactory,
    IAzureStorageResourceResolver resourceResolver,
    HttpClient httpClient,
    TokenCredential credential)
    : IBlobRestoreService
{
    private readonly ILogger<BlobRestoreService> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly IBlobClientFactory _blobClientFactory = blobClientFactory ?? throw new ArgumentNullException(nameof(blobClientFactory));
    private readonly IAzureStorageResourceResolver _resourceResolver = resourceResolver ?? throw new ArgumentNullException(nameof(resourceResolver));
    private readonly HttpClient _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
    private readonly TokenCredential _credential = credential ?? throw new ArgumentNullException(nameof(credential));

    private const string STORAGEMANAGEMENTAPIVERSION = Constants.RestoreConfiguration.STORAGE_MANAGEMENT_API_VERSION;
    private static readonly TimeSpan _defaultPollInterval = TimeSpan.FromSeconds(Constants.RestoreConfiguration.POLL_DEFAULT_INTERVAL_SECONDS);
    private static readonly TimeSpan _maxFallbackPollInterval = TimeSpan.FromSeconds(Constants.RestoreConfiguration.POLL_MAX_FALLBACK_INTERVAL_SECONDS);
    private static readonly TimeSpan _maxPollDuration = TimeSpan.FromHours(Constants.RestoreConfiguration.POLL_MAX_DURATION_HOURS);

    /// <inheritdoc/>
    public async Task<string> StartBlobRestoreAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string restorePointInTime,
        string operationId,
        string? existingRestoreId,
        CancellationToken ct)
    {
        try
        {
            _logger.LogInformation(
                "Blob restore start requested - OperationId: {OperationId}, Dataset: {Dataset}, Container: {Container}, ExpectedObjectCount: {ExpectedObjectCount}, RestorePoint: {RestorePointInTime}, ExistingRestoreId: {ExistingRestoreId}",
                operationId, storageInfo.GcsUrl, storageInfo.ContainerName, storageInfo.ExpectedObjectCount, restorePointInTime, existingRestoreId ?? "<none>");

            // NOTE: intentionally do NOT skip on ExpectedObjectCount == 0. That count is the
            // restore-TARGET version's object count, not a measure of work to do. A restore to a
            // point-in-time when the dataset had zero blobs must still submit the PITR so that any
            // blobs created AFTER that point (present in the current live state) are removed. Gating
            // on the target count left newer blobs in storage while metadata reverted to empty,
            // causing metadata/storage divergence. The PITR is a harmless no-op when the range was
            // genuinely empty at the restore point.
            var storageAccountName = await _resourceResolver.ResolveStorageAccountNameAsync(dataPartitionId, ct);
            var resourceGroupName = _resourceResolver.ResolveResourceGroupName(dataPartitionId);
            var subscriptionId = _resourceResolver.SubscriptionId;

            var restorePointInTimeUtc = DateTime.Parse(restorePointInTime, null, System.Globalization.DateTimeStyles.RoundtripKind);

            // Resume path: adopt an already-issued restore instead of starting a new one.
            if (!string.IsNullOrWhiteSpace(existingRestoreId))
            {
                var (currentRestoreId, status, _, currentTimeToRestore, currentBlobRanges) =
                    await GetAccountBlobRestoreStatusAsync(
                    subscriptionId, resourceGroupName, storageAccountName, ct);

                var currentStatus = AzureBlobRestoreStatusParser.Parse(status);
                var isSameRestore = string.Equals(currentRestoreId, existingRestoreId, StringComparison.OrdinalIgnoreCase);

                // Our tracked restore is still the account's current one — resume tracking it.
                if (isSameRestore && currentStatus.IsActiveOrCompleted())
                {
                    _logger.LogInformation(
                        "Resuming existing blob restore - RestoreId: {RestoreId}, Status: {Status}, OperationId: {OperationId}",
                        existingRestoreId, status, operationId);
                    return existingRestoreId;
                }

                // The account's current restore has a DIFFERENT id than we tracked. Azure serializes
                // restores per account and exposes only the most recent one, so we can only treat it
                // as ours when its target point-in-time and blob range match ours. When they do,
                // adopt the LATEST id so the operation tracks the live restore rather than a stale
                // tracked id (the account has effectively re-manifested our restore).
                if (!isSameRestore &&
                    !string.IsNullOrWhiteSpace(currentRestoreId) &&
                    IsSameRestorePoint(currentTimeToRestore, restorePointInTimeUtc) &&
                    IsSameBlobRange(currentBlobRanges, storageInfo) &&
                    currentStatus.IsActiveOrCompleted())
                {
                    _logger.LogInformation(
                        "Account's current restoreId ({CurrentRestoreId}) differs from tracked ({ExistingRestoreId}) but targets our point-in-time and range; adopting the latest id - OperationId: {OperationId}",
                        currentRestoreId, existingRestoreId, operationId);
                    return currentRestoreId;
                }

                // Otherwise our restore's outcome is unconfirmable: either an UNRELATED restore
                // (different point-in-time) superseded ours and hid its result, or our restore
                // failed/vanished. A newer id is NOT proof of success — the previous restore could
                // have failed. Do not assume completion; fall through and re-submit, which is
                // idempotent for the same point-in-time and reproduces identical data.
                _logger.LogWarning(
                    "Tracked restoreId {ExistingRestoreId} is not confirmable (account current: {CurrentRestoreId}, Status: {Status}); re-submitting restore - OperationId: {OperationId}",
                    existingRestoreId,
                    string.IsNullOrWhiteSpace(currentRestoreId) ? "<none>" : currentRestoreId,
                    status ?? "<none>",
                    operationId);
            }

            // Idempotency guard for the crash-before-persist window: even when no restoreId
            // was persisted, reconcile against the account's current restore by its natural key
            // (parameters.timeToRestore + blobRanges) before submitting. Azure serializes one
            // blob-range restore per account, so a restore whose target point-in-time and range
            // match ours is ours. Adopt it rather than submitting a duplicate.
            if (string.IsNullOrWhiteSpace(existingRestoreId))
            {
                var (accountRestoreId, accountStatus, _, accountTimeToRestore, accountBlobRanges) =
                    await GetAccountBlobRestoreStatusAsync(
                    subscriptionId, resourceGroupName, storageAccountName, ct);

                if (!string.IsNullOrWhiteSpace(accountRestoreId) &&
                    IsSameRestorePoint(accountTimeToRestore, restorePointInTimeUtc) &&
                    IsSameBlobRange(accountBlobRanges, storageInfo) &&
                    AzureBlobRestoreStatusParser.Parse(accountStatus).IsActiveOrCompleted())
                {
                    _logger.LogInformation(
                        "Adopting account restore matching target point-in-time and range instead of resubmitting - RestoreId: {RestoreId}, Status: {Status}, RestorePoint: {RestorePointInTime}, OperationId: {OperationId}",
                        accountRestoreId, accountStatus, restorePointInTime, operationId);
                    return accountRestoreId;
                }
            }

            var restoreId = await SubmitRestoreRangeAsync(
                subscriptionId, resourceGroupName, storageAccountName, storageInfo, restorePointInTimeUtc, operationId, ct);

            _logger.LogInformation(
                "Blob restore submitted - RestoreId: {RestoreId}, OperationId: {OperationId}", restoreId, operationId);

            return restoreId;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Blob restore start cancelled - OperationId: {OperationId}, Dataset: {Dataset}", operationId, storageInfo.GcsUrl);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Blob restore start failed - OperationId: {OperationId}, Dataset: {Dataset}, Error: {Error}", operationId, storageInfo.GcsUrl, ex.Message);
            throw;
        }
    }

    /// <inheritdoc/>
    public async Task<BlobRestoreResult> WaitForBlobRestoreAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string restoreId,
        string restorePointInTime,
        string operationId,
        CancellationToken ct)
    {
        // TotalBlobs is an informational reporting counter only. ExpectedObjectCount may be null
        // (filemetadata.nobjects absent) — treat that as 0 for reporting; it does not gate any work.
        var result = new BlobRestoreResult { TotalBlobs = (int)Math.Min(storageInfo.ExpectedObjectCount ?? 0, int.MaxValue) };

        try
        {
            // Only skip waiting when StartBlobRestoreAsync did not submit a PITR (empty restoreId).
            // Do NOT gate on ExpectedObjectCount here: that is the restore-TARGET version's count,
            // and a revert-to-empty restore (target 0, current > 0) now legitimately submits a real
            // PITR that must be polled to completion. Gating on the target count would return
            // immediately and leave the newer blobs un-removed while reporting success.
            if (string.IsNullOrWhiteSpace(restoreId))
            {
                _logger.LogInformation(
                    "No blob restore to wait on - OperationId: {OperationId}, Dataset: {Dataset}",
                    operationId, storageInfo.GcsUrl);
                result.RestoredBlobs = result.TotalBlobs;
                return result;
            }

            var storageAccountName = await _resourceResolver.ResolveStorageAccountNameAsync(dataPartitionId, ct);
            var resourceGroupName = _resourceResolver.ResolveResourceGroupName(dataPartitionId);
            var subscriptionId = _resourceResolver.SubscriptionId;

            var restorePointInTimeUtc = DateTime.Parse(restorePointInTime, null, System.Globalization.DateTimeStyles.RoundtripKind);

            await WaitForRestoreCompletionAsync(
                subscriptionId, resourceGroupName, storageAccountName, storageInfo,
                restoreId, restorePointInTimeUtc, operationId, ct);

            result.RestoredBlobs = result.TotalBlobs;

            _logger.LogInformation(
                "Blob restore completed - OperationId: {OperationId}, Dataset: {Dataset}, Total: {Total}, Restored: {Restored}",
                operationId, storageInfo.GcsUrl, result.TotalBlobs, result.RestoredBlobs);

            return result;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Blob restore wait cancelled - OperationId: {OperationId}, Dataset: {Dataset}", operationId, storageInfo.GcsUrl);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Blob restore wait failed - OperationId: {OperationId}, Dataset: {Dataset}, Error: {Error}", operationId, storageInfo.GcsUrl, ex.Message);
            throw;
        }
    }

    /// <inheritdoc/>
    public async Task<ConsistencyValidationResult> ValidateConsistencyAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string operationId,
        CancellationToken ct)
    {
        var result = new ConsistencyValidationResult { IsConsistent = true };

        try
        {
            _logger.LogInformation(
                "Consistency validation started - OperationId: {OperationId}, Dataset: {Dataset}, Container: {Container}, ExpectedObjectCount: {ExpectedObjectCount}, ExpectedTotalSize: {ExpectedTotalSize}",
                operationId, storageInfo.GcsUrl, storageInfo.ContainerName, storageInfo.ExpectedObjectCount, storageInfo.ExpectedTotalSize);

            // Always enumerate the blobs actually present under the dataset's container/virtual-folder
            // prefix (dataset access policy => dedicated container, no prefix; uniform access policy
            // => shared container with a "<uuid>/" prefix) and compare the observed object count and
            // total size against the values recorded in the dataset's filemetadata. We do NOT skip on
            // an expected count/size of 0: a revert-to-empty restore (target 0, but blobs created
            // afterwards) must be verified to have actually left the range EMPTY. Skipping would let
            // leftover blobs pass as consistent while metadata reads zero.
            var blobClient = await _blobClientFactory.GetBlobClientAsync(dataPartitionId, ct);
            var containerClient = blobClient.GetContainerClient(storageInfo.ContainerName);

            var prefix = string.IsNullOrWhiteSpace(storageInfo.VirtualFolder)
                ? null
                : storageInfo.VirtualFolder.Trim('/') + "/";

            long actualObjectCount = 0;
            long actualTotalSize = 0;
            var blobPages = containerClient.GetBlobsAsync(prefix: prefix, cancellationToken: ct)
                .AsPages(default, 5000);
            await foreach (var page in blobPages)
            {
                foreach (var blob in page.Values)
                {
                    actualObjectCount++;
                    actualTotalSize += blob.Properties.ContentLength ?? 0;
                }
            }

            // Exact-match each recorded figure against what is actually in storage, including the
            // zero case (a revert-to-empty restore must leave the range empty). Each figure is
            // validated independently and only when it was recorded: filemetadata.nobjects /
            // filemetadata.size may be absent on a version, surfacing here as a null Expected* value.
            // A null means "not recorded, cannot validate" (distinct from a recorded 0), so we log
            // and skip that specific check rather than comparing against a fabricated 0.
            var mismatches = new List<string>();

            if (storageInfo.ExpectedObjectCount is long expectedObjectCount)
            {
                if (actualObjectCount != expectedObjectCount)
                {
                    mismatches.Add(
                        $"object count mismatch (expected {expectedObjectCount}, found {actualObjectCount})");
                }
            }
            else
            {
                _logger.LogWarning(
                    "Expected object count was not recorded (filemetadata.nobjects absent); skipping object-count consistency check - ActualObjectCount: {ActualObjectCount}, OperationId: {OperationId}, Dataset: {Dataset}",
                    actualObjectCount, operationId, storageInfo.GcsUrl);
            }

            if (storageInfo.ExpectedTotalSize is long expectedTotalSize)
            {
                if (actualTotalSize != expectedTotalSize)
                {
                    mismatches.Add(
                        $"total size mismatch (expected {expectedTotalSize} bytes, found {actualTotalSize} bytes)");
                }
            }
            else
            {
                _logger.LogWarning(
                    "Expected total size was not recorded (filemetadata.size absent); skipping total-size consistency check - ActualTotalSize: {ActualTotalSize}, OperationId: {OperationId}, Dataset: {Dataset}",
                    actualTotalSize, operationId, storageInfo.GcsUrl);
            }

            if (mismatches.Count > 0)
            {
                result.IsConsistent = false;
                result.ValidationError = string.Join("; ", mismatches);
                _logger.LogError(
                    "Consistency validation failed - {Error} - OperationId: {OperationId}, Dataset: {Dataset}",
                    result.ValidationError, operationId, storageInfo.GcsUrl);
            }
            else
            {
                _logger.LogInformation(
                    "Consistency validation succeeded - ObjectCount: {ActualObjectCount}, TotalSize: {ActualTotalSize} - OperationId: {OperationId}, Dataset: {Dataset}",
                    actualObjectCount, actualTotalSize, operationId, storageInfo.GcsUrl);
            }

            return result;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Consistency validation cancelled - OperationId: {OperationId}, Dataset: {Dataset}", operationId, storageInfo.GcsUrl);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Consistency validation failed - OperationId: {OperationId}, Dataset: {Dataset}, Error: {Error}", operationId, storageInfo.GcsUrl, ex.Message);
            result.IsConsistent = false;
            result.ValidationError = $"Validation error: {ex.Message}";
            throw;
        }
    }

    /// <summary>
    /// Submits a dataset blob-range restore to the specified point in time using Azure Storage
    /// management-plane Point-in-Time Restore (PITR) and returns the restore identifier.
    ///
    /// This is a dataset-level operation:
    ///   - Uniform access policy: restore the virtual-folder prefix within a shared container.
    ///   - Dataset access policy: restore the dedicated container range for that dataset.
    ///
    /// This method only initiates the restore; the caller persists the returned id and awaits
    /// completion separately via <see cref="WaitForRestoreCompletionAsync"/> so that a redelivered
    /// message can resume the same restore.
    /// </summary>
    private async Task<string> SubmitRestoreRangeAsync(
        string subscriptionId,
        string resourceGroupName,
        string storageAccountName,
        DatasetStorageInfo storageInfo,
        DateTime restorePointInTime,
        string operationId,
        CancellationToken ct)
    {
        var (startRange, endRange) = BuildBlobRestoreRange(storageInfo);

        var requestUri = $"https://management.azure.com/subscriptions/{subscriptionId}" +
            $"/resourceGroups/{resourceGroupName}" +
            $"/providers/Microsoft.Storage/storageAccounts/{storageAccountName}/restoreBlobRanges" +
            $"?api-version={STORAGEMANAGEMENTAPIVERSION}";

        var requestBody = JsonSerializer.Serialize(new
        {
            timeToRestore = restorePointInTime.ToUniversalTime().ToString("O"),
            blobRanges = new[]
            {
                new
                {
                    startRange,
                    endRange,
                }
            }
        });

        var token = await _credential.GetTokenAsync(
            new TokenRequestContext(["https://management.azure.com/.default"]), ct);

        using var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = new StringContent(requestBody, System.Text.Encoding.UTF8)
        };
        request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.Token);

        _logger.LogInformation(
            "Submitting management-plane PITR request - StorageAccount: {StorageAccount}, ResourceGroup: {ResourceGroup}, StartRange: {StartRange}, EndRange: {EndRange}, RestorePoint: {RestorePointInTime}, OperationId: {OperationId}",
            storageAccountName, resourceGroupName, startRange, endRange, restorePointInTime, operationId);

        using var response = await _httpClient.SendAsync(request, ct);

        // A restore is already running on this account (e.g. our own prior submission whose id we
        // lost). Recover and adopt the in-flight restore rather than failing.
        if (response.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            var (conflictRestoreId, conflictStatus, _, conflictTimeToRestore, conflictBlobRanges) =
                await GetAccountBlobRestoreStatusAsync(
                subscriptionId, resourceGroupName, storageAccountName, ct);

            // Only adopt the blocking restore if its target point-in-time and blob range match ours.
            if (!string.IsNullOrWhiteSpace(conflictRestoreId) &&
                IsSameRestorePoint(conflictTimeToRestore, restorePointInTime) &&
                IsSameBlobRange(conflictBlobRanges, storageInfo))
            {
                _logger.LogWarning(
                    "PITR request returned 409 Conflict; adopting in-flight restore with matching time and range - RestoreId: {RestoreId}, Status: {Status}, OperationId: {OperationId}",
                    conflictRestoreId, conflictStatus ?? "<unknown>", operationId);
                return conflictRestoreId;
            }

            // Either no adoptable restore id could be read back yet, or a different (non-matching)
            // restore is occupying the account's single restore slot. Only one blob-range restore
            // is allowed per account at a time, so this is a transient condition: ask the caller to
            // retry, allowing the operation to resume on redelivery rather than failing permanently.
            var conflictBody = await response.Content.ReadAsStringAsync(ct);
            throw new RetryableRestoreException(
                $"PITR request conflicted (409) but no matching in-flight restore could be adopted; will retry. OperationId: {operationId}. Body: {conflictBody}");
        }

        if (!response.IsSuccessStatusCode)
        {
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Storage PITR request failed with status {(int)response.StatusCode}: {responseBody}");
        }

        string? restoreId;
        try
        {
            restoreId = await ParseRestoreIdFromResponseAsync(response, ct);
            if (string.IsNullOrWhiteSpace(restoreId))
            {
                // Some responses omit the id in the body; recover it from the account status.
                var (accountRestoreId, _, _, _, _) = await GetAccountBlobRestoreStatusAsync(
                    subscriptionId, resourceGroupName, storageAccountName, ct);
                restoreId = accountRestoreId;
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new RetryableRestoreException(
                $"PITR request was accepted but its restoreId could not be recovered. OperationId: {operationId}",
                ex);
        }

        if (string.IsNullOrWhiteSpace(restoreId))
        {
            throw new RetryableRestoreException(
                $"PITR request was accepted but its restoreId is not visible yet. OperationId: {operationId}");
        }

        _logger.LogInformation(
            "PITR request submitted - RestoreId: {RestoreId}, OperationId: {OperationId}", restoreId, operationId);

        return restoreId;
    }

    /// <summary>
    /// Builds the half-open PITR range <c>[startRange, endRange)</c> for a dataset: dataset policy
    /// uses the whole container <c>["c/!", "c0")</c>; uniform policy uses <c>["c/folder/", "c/folder0")</c>.
    /// </summary>
    private static (string StartRange, string EndRange) BuildBlobRestoreRange(DatasetStorageInfo storageInfo)
    {
        if (string.IsNullOrWhiteSpace(storageInfo.VirtualFolder))
        {
            // Azure parses a range endpoint as "<container>/<blob>" and rejects an empty blob
            // name. Azure trims a trailing space from the range, so use the lowest non-whitespace
            // prefix before the numeric object names stored in dedicated dataset containers.
            return ($"{storageInfo.ContainerName}/!", $"{storageInfo.ContainerName}0");
        }

        var folderPrefix = $"{storageInfo.ContainerName}/{storageInfo.VirtualFolder.Trim('/')}/";
        return (folderPrefix, folderPrefix[..^1] + "0");
    }

    private static bool IsSameBlobRange(
        IReadOnlyCollection<BlobRange> blobRanges,
        DatasetStorageInfo storageInfo)
    {
        var expected = BuildBlobRestoreRange(storageInfo);
        return blobRanges.Any(range =>
            string.Equals(range.StartRange, expected.StartRange, StringComparison.Ordinal) &&
            string.Equals(range.EndRange, expected.EndRange, StringComparison.Ordinal));
    }

    /// <summary>
    /// Parses the <c>restoreId</c> from a restoreBlobRanges response body, or null if absent.
    /// </summary>
    private static async Task<string?> ParseRestoreIdFromResponseAsync(
        HttpResponseMessage response, CancellationToken ct)
    {
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(payload);
            return doc.RootElement.TryGetProperty("restoreId", out var idElement)
                ? idElement.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Reads the storage account's current blob-restore status (restoreId + status + failure
    /// reason + the target time-to-restore) via GET storageAccounts?$expand=blobRestoreStatus.
    /// Returns (null, null, null, null) when no restore has ever been recorded on the account.
    ///
    /// TimeToRestore is the restore's natural key: because Azure serializes one blob-range restore
    /// per account, a restore whose TimeToRestore matches our target point-in-time IS ours, even
    /// when we never persisted its restoreId.
    /// </summary>
    private async Task<(
        string? RestoreId,
        string? Status,
        string? FailureReason,
        string? TimeToRestore,
        IReadOnlyCollection<BlobRange> BlobRanges)> GetAccountBlobRestoreStatusAsync(
        string subscriptionId,
        string resourceGroupName,
        string storageAccountName,
        CancellationToken ct)
    {
        var uri = $"https://management.azure.com/subscriptions/{subscriptionId}" +
            $"/resourceGroups/{resourceGroupName}" +
            $"/providers/Microsoft.Storage/storageAccounts/{storageAccountName}" +
            $"?api-version={STORAGEMANAGEMENTAPIVERSION}&$expand=blobRestoreStatus";

        var token = await _credential.GetTokenAsync(
            new TokenRequestContext(["https://management.azure.com/.default"]), ct);

        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.Token);

        using var response = await _httpClient.SendAsync(request, ct);
        _ = response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return (null, null, null, null, []);
        }

        using var doc = JsonDocument.Parse(payload);
        if (doc.RootElement.TryGetProperty("properties", out var properties) &&
            properties.TryGetProperty("blobRestoreStatus", out var blobRestoreStatus))
        {
            var restoreId = blobRestoreStatus.TryGetProperty("restoreId", out var idElement)
                ? idElement.GetString()
                : null;
            var status = blobRestoreStatus.TryGetProperty("status", out var statusElement)
                ? statusElement.GetString()
                : null;
            var failureReason = blobRestoreStatus.TryGetProperty("failureReason", out var reasonElement)
                ? reasonElement.GetString()
                : null;
            string? timeToRestore = null;
            var blobRanges = new List<BlobRange>();
            if (blobRestoreStatus.TryGetProperty("parameters", out var parametersElement))
            {
                timeToRestore = parametersElement.TryGetProperty("timeToRestore", out var timeElement)
                    ? timeElement.GetString()
                    : null;
                if (parametersElement.TryGetProperty("blobRanges", out var rangesElement) &&
                    rangesElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var rangeElement in rangesElement.EnumerateArray())
                    {
                        if (rangeElement.TryGetProperty("startRange", out var startElement) &&
                            rangeElement.TryGetProperty("endRange", out var endElement) &&
                            startElement.GetString() is { } startRange &&
                            endElement.GetString() is { } endRange)
                        {
                            blobRanges.Add(new BlobRange(startRange, endRange));
                        }
                    }
                }
            }
            return (restoreId, status, failureReason, timeToRestore, blobRanges);
        }

        return (null, null, null, null, []);
    }

    /// <summary>
    /// Polls the storage account's blob-restore status until the restore identified by
    /// <paramref name="restoreId"/> completes, fails, or times out.
    ///
    /// Account-status polling (rather than the 202 async-operation header) is used so the wait
    /// can resume after a pod restart, where the header URL is no longer available. A fresh
    /// bearer token is fetched on every poll so the loop never fails on token expiry during
    /// long-running restores (ARM tokens expire in ~1 hour).
    ///
    /// Because Azure serializes restores per account and exposes only the most recent one, a
    /// status that reports a DIFFERENT restoreId is only treated as our completion when its target
    /// <paramref name="restorePointInTimeUtc"/> and dataset range match ours; otherwise an unrelated
    /// restore superseded ours and hid its outcome, so we raise a retryable condition rather than
    /// falsely reporting success.
    /// </summary>
    private async Task WaitForRestoreCompletionAsync(
        string subscriptionId,
        string resourceGroupName,
        string storageAccountName,
        DatasetStorageInfo storageInfo,
        string restoreId,
        DateTime restorePointInTimeUtc,
        string operationId,
        CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        var backoffAttempt = 0;

        while (true)
        {
            if (stopwatch.Elapsed > _maxPollDuration)
            {
                throw new TimeoutException(
                    $"PITR polling exceeded timeout of {_maxPollDuration.TotalMinutes} minutes. RestoreId: {restoreId}, OperationId: {operationId}");
            }

            await Task.Delay(GetFallbackPollDelay(backoffAttempt++), ct);

            var (currentRestoreId, status, failureReason, currentTimeToRestore, currentBlobRanges) =
                await GetAccountBlobRestoreStatusAsync(
                subscriptionId, resourceGroupName, storageAccountName, ct);

            if (string.IsNullOrWhiteSpace(status))
            {
                _logger.LogInformation(
                    "No blob-restore status reported yet; continuing to poll. RestoreId: {RestoreId}, OperationId: {OperationId}",
                    restoreId, operationId);
                continue;
            }

            // A different restoreId is now the most recent one. Restores are serialized per account
            // and the account only exposes the latest, so ours is no longer directly observable.
            if (!string.IsNullOrWhiteSpace(currentRestoreId) &&
                !string.Equals(currentRestoreId, restoreId, StringComparison.OrdinalIgnoreCase))
            {
                // Same target point-in-time and range means the same data outcome. Adopt the newer id and fall through
                // to the status evaluation below rather than returning: the re-manifested restore may
                // still be InProgress (keep polling) or have Failed (use the failure path). Returning
                // here unconditionally would report success while the blob PITR is still running or
                // has already failed.
                if (IsSameRestorePoint(currentTimeToRestore, restorePointInTimeUtc) &&
                    IsSameBlobRange(currentBlobRanges, storageInfo))
                {
                    _logger.LogInformation(
                        "Account reports a newer restoreId ({CurrentRestoreId}) than tracked ({RestoreId}) but targeting our point-in-time and range; adopting latest id and continuing to track its status - OperationId: {OperationId}",
                        currentRestoreId, restoreId, operationId);
                    restoreId = currentRestoreId;
                }

                else
                {
                    // A different id whose point-in-time or range differs is unrelated and may have
                    // hidden our outcome. Do not report completion; resume on redelivery.
                    _logger.LogWarning(
                        "Account reports a newer restoreId ({CurrentRestoreId}) targeting a different point-in-time or range than tracked ({RestoreId}); restore outcome is unconfirmable, will resume on redelivery - OperationId: {OperationId}",
                        currentRestoreId, restoreId, operationId);
                    throw new RetryableRestoreException(
                        "The tracked restore was superseded by an unrelated time or range before completion could be confirmed; retrying.");
                }
            }

            // Account-level blobRestoreStatus reports InProgress | Complete/Succeeded | Failed.
            // The ARM schema documents "Complete" while the restoreBlobRanges response example
            // shows "Succeeded"; the parser treats both as terminal success.
            var restoreStatus = AzureBlobRestoreStatusParser.Parse(status);
            if (restoreStatus == AzureBlobRestoreStatus.Complete)
            {
                _logger.LogInformation(
                    "PITR completed successfully - RestoreId: {RestoreId}, OperationId: {OperationId}",
                    restoreId, operationId);
                return;
            }

            if (restoreStatus == AzureBlobRestoreStatus.Failed)
            {
                // Log full internal diagnostics (identifiers + Azure failure reason) for support
                // triage, but surface only a sanitized, customer-safe message on the operation
                // status. This is a terminal failure: the same inputs will fail again on retry.
                _logger.LogError(
                    "PITR restore failed - RestoreId: {RestoreId}, OperationId: {OperationId}, AzureFailureReason: {FailureReason}",
                    restoreId, operationId, string.IsNullOrWhiteSpace(failureReason) ? "<none>" : failureReason);

                throw new BlobRestoreFailedException(
                    "Point-in-time restore failed while restoring storage data. Please retry the restore; if the problem persists, contact support.");
            }

            _logger.LogInformation(
                "PITR still in progress - Status: {Status}, RestoreId: {RestoreId}, OperationId: {OperationId}",
                status, restoreId, operationId);
        }
    }

    /// <summary>
    /// Determines whether an account-reported <c>timeToRestore</c> refers to the same point-in-time
    /// as our target restore. Both values originate from ISO-8601 round-trip formatting of the same
    /// UTC instant, but are compared at one-second tolerance to absorb any serialization rounding.
    /// Returns false when the account value is missing or unparseable.
    /// </summary>
    private static bool IsSameRestorePoint(string? accountTimeToRestore, DateTime targetRestorePoint)
    {
        if (string.IsNullOrWhiteSpace(accountTimeToRestore))
        {
            return false;
        }

        if (!DateTimeOffset.TryParse(
                accountTimeToRestore,
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.RoundtripKind,
                out var accountInstant))
        {
            return false;
        }

        return Math.Abs((accountInstant.UtcDateTime - targetRestorePoint.ToUniversalTime()).TotalSeconds) < 1.0;
    }

    private static TimeSpan GetFallbackPollDelay(int attempt)
    {
        var exponent = Math.Min(Math.Max(attempt, 0), Constants.RestoreConfiguration.POLL_MAX_BACKOFF_EXPONENT);
        var exponentialDelayMs = _defaultPollInterval.TotalMilliseconds * Math.Pow(2, exponent);
        var cappedDelayMs = Math.Min(exponentialDelayMs, _maxFallbackPollInterval.TotalMilliseconds);
        return TimeSpan.FromMilliseconds(cappedDelayMs);
    }

    private sealed record BlobRange(string StartRange, string EndRange);
}
