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

    private const int ParallelBlobRestoreLimit = Constants.RestoreConfiguration.PARALLEL_BLOB_RESTORE_LIMIT; // Limit concurrent restore operations
    private const string StorageManagementApiVersion = Constants.RestoreConfiguration.STORAGE_MANAGEMENT_API_VERSION;
    private static readonly TimeSpan DefaultPollInterval = TimeSpan.FromSeconds(Constants.RestoreConfiguration.POLL_DEFAULT_INTERVAL_SECONDS);
    private static readonly TimeSpan MaxFallbackPollInterval = TimeSpan.FromSeconds(Constants.RestoreConfiguration.POLL_MAX_FALLBACK_INTERVAL_SECONDS);
    private static readonly TimeSpan MaxPollDuration = TimeSpan.FromHours(Constants.RestoreConfiguration.POLL_MAX_DURATION_HOURS);

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
                "Blob restore start requested - OperationId: {OperationId}, Dataset: {Dataset}, Container: {Container}, BlobCount: {BlobCount}, RestorePoint: {RestorePointInTime}, ExistingRestoreId: {ExistingRestoreId}",
                operationId, storageInfo.GcsUrl, storageInfo.ContainerName, storageInfo.BlobPaths.Count, restorePointInTime, existingRestoreId ?? "<none>");

            if (storageInfo.BlobPaths.Count == 0)
            {
                _logger.LogInformation(
                    "No blobs to restore for dataset - OperationId: {OperationId}, Dataset: {Dataset}, Container: {Container}",
                    operationId, storageInfo.GcsUrl, storageInfo.ContainerName);
                return string.Empty;
            }

            var storageAccountName = await _resourceResolver.ResolveStorageAccountNameAsync(dataPartitionId, ct);
            var resourceGroupName = _resourceResolver.ResolveResourceGroupName(dataPartitionId);
            var subscriptionId = _resourceResolver.SubscriptionId;

            // Resume path: adopt an already-issued restore instead of starting a new one.
            if (!string.IsNullOrWhiteSpace(existingRestoreId))
            {
                var (currentRestoreId, status) = await GetAccountBlobRestoreStatusAsync(
                    subscriptionId, resourceGroupName, storageAccountName, ct);

                var isSameRestore = string.Equals(currentRestoreId, existingRestoreId, StringComparison.OrdinalIgnoreCase);

                // A newer restore id is now the active one on the account. Because restores are
                // serialized per account, our previously tracked restore is no longer the active
                // one — and we cannot assume it completed successfully (it may have failed before
                // being superseded, and its terminal status is no longer observable). Adopt the
                // latest restore id so the caller tracks and waits on a real, observable status
                // instead of an unverifiable assumption; the downstream consistency validation
                // remains the final guard for this dataset's blobs.
                if (!isSameRestore && !string.IsNullOrWhiteSpace(currentRestoreId))
                {
                    _logger.LogInformation(
                        "Account reports a newer restoreId ({CurrentRestoreId}) than tracked ({ExistingRestoreId}); adopting the latest restore id for tracking - OperationId: {OperationId}",
                        currentRestoreId, existingRestoreId, operationId);
                    return currentRestoreId;
                }

                if (isSameRestore &&
                    (string.Equals(status, "InProgress", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(status, "Complete", StringComparison.OrdinalIgnoreCase)))
                {
                    _logger.LogInformation(
                        "Resuming existing blob restore - RestoreId: {RestoreId}, Status: {Status}, OperationId: {OperationId}",
                        existingRestoreId, status, operationId);
                    return existingRestoreId;
                }

                _logger.LogWarning(
                    "Existing restoreId {ExistingRestoreId} is no longer usable (Status: {Status}); starting a new blob restore - OperationId: {OperationId}",
                    existingRestoreId, status ?? "<none>", operationId);
            }

            var restorePointInTimeUtc = DateTime.Parse(restorePointInTime, null, System.Globalization.DateTimeStyles.RoundtripKind);
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
        string operationId,
        CancellationToken ct)
    {
        var result = new BlobRestoreResult { TotalBlobs = storageInfo.BlobPaths.Count };

        try
        {
            if (storageInfo.BlobPaths.Count == 0 || string.IsNullOrWhiteSpace(restoreId))
            {
                _logger.LogInformation(
                    "No blob restore to wait on - OperationId: {OperationId}, Dataset: {Dataset}",
                    operationId, storageInfo.GcsUrl);
                result.RestoredBlobs = storageInfo.BlobPaths.Count;
                return result;
            }

            var storageAccountName = await _resourceResolver.ResolveStorageAccountNameAsync(dataPartitionId, ct);
            var resourceGroupName = _resourceResolver.ResolveResourceGroupName(dataPartitionId);
            var subscriptionId = _resourceResolver.SubscriptionId;

            await WaitForRestoreCompletionAsync(
                subscriptionId, resourceGroupName, storageAccountName, restoreId, operationId, ct);

            result.RestoredBlobs = storageInfo.BlobPaths.Count;

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
                "Consistency validation started - OperationId: {OperationId}, Dataset: {Dataset}, Container: {Container}, BlobCount: {BlobCount}",
                operationId, storageInfo.GcsUrl, storageInfo.ContainerName, storageInfo.BlobPaths.Count);

            if (storageInfo.BlobPaths.Count == 0)
            {
                _logger.LogInformation(
                    "No blobs to validate - consistency check passed - OperationId: {OperationId}, Dataset: {Dataset}",
                    operationId, storageInfo.GcsUrl);
                return result;
            }

            // Check existence of each blob using the correct container from gcsurl
            var blobClient = await _blobClientFactory.GetBlobClientAsync(dataPartitionId, ct);
            var containerClient = blobClient.GetContainerClient(storageInfo.ContainerName);

            var missingBlobs = new List<string>();
            using var semaphore = new System.Threading.SemaphoreSlim(ParallelBlobRestoreLimit);

            var validationTasks = storageInfo.BlobPaths.Select(async blobPath =>
            {
                await semaphore.WaitAsync(ct);
                try
                {
                    var blobClientForPath = containerClient.GetBlobClient(blobPath);
                    try
                    {
                        _ = await blobClientForPath.GetPropertiesAsync(cancellationToken: ct);
                    }
                    catch (Azure.RequestFailedException ex) when (ex.Status == 404)
                    {
                        lock (missingBlobs)
                        {
                            missingBlobs.Add(blobPath);
                        }
                        _logger.LogWarning(
                            "Missing blob detected during consistency validation - BlobPath: {BlobPath}, OperationId: {OperationId}",
                            blobPath, operationId);
                    }
                }
                finally
                {
                    _ = semaphore.Release();
                }
            });

            await Task.WhenAll(validationTasks);

            if (missingBlobs.Count > 0)
            {
                result.IsConsistent = false;
                result.MissingBlobs = missingBlobs;
                result.ValidationError = $"Found {missingBlobs.Count} missing blobs out of {storageInfo.BlobPaths.Count} total blobs";
                _logger.LogError(
                    "Consistency validation failed - {MissingCount} missing blobs detected - OperationId: {OperationId}, Dataset: {Dataset}",
                    missingBlobs.Count, operationId, storageInfo.GcsUrl);
            }
            else
            {
                _logger.LogInformation(
                    "Consistency validation succeeded - all {BlobCount} blobs exist - OperationId: {OperationId}, Dataset: {Dataset}",
                    storageInfo.BlobPaths.Count, operationId, storageInfo.GcsUrl);
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
        var rangePrefix = string.IsNullOrWhiteSpace(storageInfo.VirtualFolder)
            ? $"{storageInfo.ContainerName}/"
            : $"{storageInfo.ContainerName}/{storageInfo.VirtualFolder.Trim('/')}/";
        var requestUri = $"https://management.azure.com/subscriptions/{subscriptionId}" +
            $"/resourceGroups/{resourceGroupName}" +
            $"/providers/Microsoft.Storage/storageAccounts/{storageAccountName}/restoreBlobRanges" +
            $"?api-version={StorageManagementApiVersion}";

        var requestBody = JsonSerializer.Serialize(new
        {
            timeToRestore = restorePointInTime.ToUniversalTime().ToString("O"),
            blobRanges = new[]
            {
                new
                {
                    startRange = rangePrefix,
                    endRange = rangePrefix + "~",
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
            "Submitting management-plane PITR request - StorageAccount: {StorageAccount}, ResourceGroup: {ResourceGroup}, RangePrefix: {RangePrefix}, RestorePoint: {RestorePointInTime}, OperationId: {OperationId}",
            storageAccountName, resourceGroupName, rangePrefix, restorePointInTime, operationId);

        using var response = await _httpClient.SendAsync(request, ct);

        // A restore is already running on this account (e.g. our own prior submission whose id we
        // lost). Recover and adopt the in-flight restore rather than failing.
        if (response.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            var (conflictRestoreId, conflictStatus) = await GetAccountBlobRestoreStatusAsync(
                subscriptionId, resourceGroupName, storageAccountName, ct);
            if (!string.IsNullOrWhiteSpace(conflictRestoreId))
            {
                _logger.LogWarning(
                    "PITR request returned 409 Conflict; adopting in-flight restore - RestoreId: {RestoreId}, Status: {Status}, OperationId: {OperationId}",
                    conflictRestoreId, conflictStatus ?? "<unknown>", operationId);
                return conflictRestoreId;
            }
        }

        if (!response.IsSuccessStatusCode)
        {
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Storage PITR request failed with status {(int)response.StatusCode}: {responseBody}");
        }

        var restoreId = await ParseRestoreIdFromResponseAsync(response, ct);
        if (string.IsNullOrWhiteSpace(restoreId))
        {
            // Some responses omit the id in the body; recover it from the account status.
            var (accountRestoreId, _) = await GetAccountBlobRestoreStatusAsync(
                subscriptionId, resourceGroupName, storageAccountName, ct);
            restoreId = accountRestoreId;
        }

        if (string.IsNullOrWhiteSpace(restoreId))
        {
            throw new InvalidOperationException(
                $"PITR request accepted but no restoreId could be determined. OperationId: {operationId}");
        }

        _logger.LogInformation(
            "PITR request submitted - RestoreId: {RestoreId}, OperationId: {OperationId}", restoreId, operationId);

        return restoreId;
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
    /// Reads the storage account's current blob-restore status (restoreId + status) via
    /// GET storageAccounts?$expand=blobRestoreStatus. Returns (null, null) when no restore
    /// has ever been recorded on the account.
    /// </summary>
    private async Task<(string? RestoreId, string? Status)> GetAccountBlobRestoreStatusAsync(
        string subscriptionId,
        string resourceGroupName,
        string storageAccountName,
        CancellationToken ct)
    {
        var uri = $"https://management.azure.com/subscriptions/{subscriptionId}" +
            $"/resourceGroups/{resourceGroupName}" +
            $"/providers/Microsoft.Storage/storageAccounts/{storageAccountName}" +
            $"?api-version={StorageManagementApiVersion}&$expand=blobRestoreStatus";

        var token = await _credential.GetTokenAsync(
            new TokenRequestContext(["https://management.azure.com/.default"]), ct);

        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.Token);

        using var response = await _httpClient.SendAsync(request, ct);
        _ = response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return (null, null);
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
            return (restoreId, status);
        }

        return (null, null);
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
    /// status that reports a different restoreId means our tracked restore is no longer
    /// observable. We do not assume it succeeded (it may have failed before being superseded);
    /// instead we surface an indeterminate result so the operation is retried and re-adopts the
    /// latest observable restore.
    /// </summary>
    private async Task WaitForRestoreCompletionAsync(
        string subscriptionId,
        string resourceGroupName,
        string storageAccountName,
        string restoreId,
        string operationId,
        CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        var backoffAttempt = 0;

        while (true)
        {
            if (stopwatch.Elapsed > MaxPollDuration)
            {
                throw new TimeoutException(
                    $"PITR polling exceeded timeout of {MaxPollDuration.TotalMinutes} minutes. RestoreId: {restoreId}, OperationId: {operationId}");
            }

            await Task.Delay(GetFallbackPollDelay(backoffAttempt++), ct);

            var (currentRestoreId, status) = await GetAccountBlobRestoreStatusAsync(
                subscriptionId, resourceGroupName, storageAccountName, ct);

            if (string.IsNullOrWhiteSpace(status))
            {
                _logger.LogInformation(
                    "No blob-restore status reported yet; continuing to poll. RestoreId: {RestoreId}, OperationId: {OperationId}",
                    restoreId, operationId);
                continue;
            }

            // A different restoreId is now the most recent one. Since restores are serialized
            // per account, our tracked restore is no longer the active one and its terminal
            // status is no longer observable — we cannot assume it succeeded (it may have failed
            // before being superseded). Surface an indeterminate result so the operation is
            // retried; the resume path will then adopt and wait on the latest observable restore,
            // and consistency validation remains the final guard for this dataset's blobs.
            if (!string.IsNullOrWhiteSpace(currentRestoreId) &&
                !string.Equals(currentRestoreId, restoreId, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "Account reports a newer restoreId ({CurrentRestoreId}) than tracked ({RestoreId}); tracked restore is no longer observable, requesting retry to track the latest - OperationId: {OperationId}",
                    currentRestoreId, restoreId, operationId);
                throw new InvalidOperationException(
                    $"Tracked restore '{restoreId}' was superseded by a newer restore '{currentRestoreId}' before its terminal status could be observed. OperationId: {operationId}");
            }

            // Account-level blobRestoreStatus only ever reports InProgress | Complete | Failed.
            if (string.Equals(status, "Complete", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogInformation(
                    "PITR completed successfully - RestoreId: {RestoreId}, OperationId: {OperationId}",
                    restoreId, operationId);
                return;
            }

            if (string.Equals(status, "Failed", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"PITR finished with status '{status}'. RestoreId: {restoreId}, OperationId: {operationId}");
            }

            _logger.LogInformation(
                "PITR still in progress - Status: {Status}, RestoreId: {RestoreId}, OperationId: {OperationId}",
                status, restoreId, operationId);
        }
    }

    private static TimeSpan GetFallbackPollDelay(int attempt)
    {
        var exponent = Math.Min(Math.Max(attempt, 0), Constants.RestoreConfiguration.POLL_MAX_BACKOFF_EXPONENT);
        var exponentialDelayMs = DefaultPollInterval.TotalMilliseconds * Math.Pow(2, exponent);
        var cappedDelayMs = Math.Min(exponentialDelayMs, MaxFallbackPollInterval.TotalMilliseconds);
        return TimeSpan.FromMilliseconds(cappedDelayMs);
    }

}
