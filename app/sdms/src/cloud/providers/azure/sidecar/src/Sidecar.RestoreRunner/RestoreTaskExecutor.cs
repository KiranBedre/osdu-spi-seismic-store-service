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

namespace Sidecar.RestoreRunner;

using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Polly;
using Polly.Registry;
using Serilog.Context;
using Sidecar.Common.Exceptions;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Resilience;
using Sidecar.Common.Service;
using Sidecar.Common.Utility;

/// <summary>
/// Processes a single restore operation message from the Storage Queue.
///
/// Concurrency contract:
///   - Dataset lock key: {tenant}/{subproject}/{path}/{dataset}
///     Acquired unconditionally at operation start.
///   - Operation lock is created upstream by Node.js and is never acquired here.
///     Sidecar only releases operation lock key restore-op-lock:{dataPartitionId}
///     with lock value operationId.
///   Dataset lock value uses operationId-based idempotent format.
///   A conflicting dataset lock results in status "Rejected", message discarded.
///
/// Restore stages orchestrated by this class:
///   1. Acquire dataset Redis lock (unconditional)
///   2. Create/verify Cosmos status document (InProgress)
///   3. Resolve storage location from current metadata (via IDatasetStorageInfoProvider)
///   4. Invoke BlobRestoreService for storage-account PITR (blobs must be ready first)
///   5. Invoke MetadataRestoreService finalization (activation/commit point)
///   6. Invoke consistency validation (metadata vs blob alignment)
///   7. Mark status Succeeded / Failed with detailed error tracking
///   8. Release dataset lock and operation lock
///
/// Sequence rationale:
///   - Stage 3 reads current metadata once and discovers where dataset lives
///   - Stage 4 restores blobs (immutable after PITR)
///   - Stage 5 restores metadata (makes it visible to app)
///   - This prevents windows where metadata points to unavailable blobs
/// </summary>
public class RestoreTaskExecutor(
    ILogger<RestoreTaskExecutor> logger,
    ILockManager lockManager,
    IRestoreOperationStatusStorage statusStorage,
    IDatasetStorageInfoProvider datasetStorageInfoProvider,
    IMetadataRestoreService metadataRestoreService,
    IBlobRestoreService blobRestoreService,
    IContainerRestoreService containerRestoreService,
    IDataAccess dataAccess,
    ICosmosClientFactory cosmosClientFactory,
    ResiliencePipelineProvider<string>? resiliencePipelineProvider = null)
    : ITaskExecutor<IRestoreOperationMessage>
{
    private readonly ILogger<RestoreTaskExecutor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly ILockManager _lockManager = lockManager ?? throw new ArgumentNullException(nameof(lockManager));
    private readonly IRestoreOperationStatusStorage _statusStorage = statusStorage ?? throw new ArgumentNullException(nameof(statusStorage));
    private readonly IDatasetStorageInfoProvider _datasetStorageInfoProvider = datasetStorageInfoProvider ?? throw new ArgumentNullException(nameof(datasetStorageInfoProvider));
    private readonly IMetadataRestoreService _metadataRestoreService = metadataRestoreService ?? throw new ArgumentNullException(nameof(metadataRestoreService));
    private readonly IBlobRestoreService _blobRestoreService = blobRestoreService ?? throw new ArgumentNullException(nameof(blobRestoreService));
    private readonly IContainerRestoreService _containerRestoreService = containerRestoreService ?? throw new ArgumentNullException(nameof(containerRestoreService));
    private readonly IDataAccess _dataAccess = dataAccess ?? throw new ArgumentNullException(nameof(dataAccess));
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));

    // In-code retry for SHORT, transient blips (Cosmos 429/503/timeout, HTTP/socket) during the
    // long-running finalize and consistency-validation stages. Swallowing a hiccup here avoids
    // paying a whole queue redelivery (re-lock, re-read, re-validate) for a momentary fault.
    // Deterministic failures (RestoreRejected, non-retriable auth/Cosmos 400/403) are NOT transient,
    // so the pipeline rethrows them unchanged and the existing stage catch-blocks classify them.
    // Falls back to a no-op pipeline when the provider is absent (e.g. unit tests).
    private readonly ResiliencePipeline _generalPipeline =
        resiliencePipelineProvider?.GetPipeline(ResilienceExtensions.GeneralPipeline) ?? ResiliencePipeline.Empty;

    public async Task ProcessAsync(IRestoreOperationMessage message, CancellationToken ct)
    {
        var sdPathParts = ParseSdPath(message.SdPath);
        var tenant = sdPathParts.Tenant;

        using var _ = LogContext.PushProperty("OperationId", message.OperationId);
        using var __ = LogContext.PushProperty("Tenant", tenant);
        using var ___ = LogContext.PushProperty("SdPath", message.SdPath);
        IDisposable? correlationIdContext = null;
        if (!string.IsNullOrEmpty(message.CorrelationId))
        {
            correlationIdContext = LogContext.PushProperty("correlationID", message.CorrelationId);
        }

        using var ____ = correlationIdContext;

        _logger.LogInformation("Restore task received - OperationId: {OperationId}, Tenant: {Tenant}, SdPath: {SdPath}, RestorePoint: {RestorePointInTime}",
            message.OperationId, tenant, message.SdPath, message.RestorePointInTime);

        // --- 1. Acquire dataset lock unconditionally ---
        // Lock is always taken on the dataset path regardless of whether the dataset currently
        // exists. This prevents a race where restoring a deleted dataset makes it visible to
        // writers before restore is complete (no existing document = no existing lock = race).
        // Operation lock is acquired upstream by Node.js and only released by this executor.
        var operationLockKey = $"restore-op-lock:{tenant}";
        var operationLockId = message.OperationId;
        var datasetLockKey = GetDatasetLockKey(sdPathParts);
        var datasetLockId = $"{Constants.WRITE_LOCK_PREFIX}{message.OperationId}:{datasetLockKey}";
        var lockTtl = TimeSpan.FromHours(Constants.RestoreConfiguration.LOCK_TTL_HOURS);
        WriteLockSession? datasetLockSession = null;

        // When a failure leaves the dataset in a potentially inconsistent state (one restore
        // track completed while another failed), both locks are retained and the message is
        // retried at the queue level instead of releasing locks. See the RestoreRetryableException
        // handler below.
        var retainLocksForRetry = false;
        var blobRestoreMayHaveStarted = false;

        try
        {
            // Log whether this is a restore-of-existing or restore-of-deleted (observability only).
            var datasetExists = await DatasetExistsAsync(sdPathParts, message.OperationId, ct);
            _logger.LogInformation(
                "Dataset existence check - Exists: {DatasetExists}, SdPath: {SdPath}, OperationId: {OperationId}",
                datasetExists, message.SdPath, message.OperationId);

            datasetLockSession = await _lockManager.AcquireWriteLockAsync(datasetLockKey, datasetLockId, lockTtl);
            if (!datasetLockSession.Locked)
            {
                _logger.LogWarning(
                    "Restore rejected — dataset lock is already held. DatasetLockKey: {DatasetLockKey}, OperationId: {OperationId}",
                    datasetLockKey, message.OperationId);

                var lockConflictDetails =
                    $"Restore rejected: the dataset '{message.SdPath}' is currently locked by another in-progress write " +
                    "operation. Wait for that operation to finish and release the lock, then retry this restore.";
                await SetStatusAsync(message, Common.RestoreOperationStatus.Rejected, ct, lockConflictDetails);
                return;
            }

            _logger.LogInformation("Restore dataset lock acquired - LockKey: {LockKey}, Idempotent: {IsIdempotent}",
                datasetLockKey, datasetLockSession.IsIdempotent);

            // --- 2. Create / verify Cosmos status document ---
            var existingStatus = await _statusStorage.GetRestoreOperationStatusAsync(
                tenant, message.OperationId, ct);
            var isNewStatus = false;

            if (existingStatus is null)
            {
                var newStatus = new Common.Model.RestoreOperationStatus
                {
                    OperationId = message.OperationId,
                    CreatedBy = message.CreatedBy,
                    SdPath = message.SdPath,
                    Tenant = sdPathParts.Tenant,
                    Subproject = sdPathParts.Subproject,
                    RestorePointInTime = message.RestorePointInTime,
                    CorrelationId = message.CorrelationId,
                    Status = ToStatusString(Common.RestoreOperationStatus.InProgress),
                };
                existingStatus = await _statusStorage.CreateStatusAsync(tenant, newStatus, ct);
                isNewStatus = true;
                _logger.LogInformation("Restore status created - OperationId: {OperationId}", message.OperationId);
            }

            var trackedStatus = existingStatus;
            if (!isNewStatus)
            {
                _logger.LogInformation("Restore status already exists (idempotent re-entry) - Status: {Status}, OperationId: {OperationId}",
                    trackedStatus.Document.Status, message.OperationId);

                // Terminal states are final; do not reopen them.
                if (IsTerminalStatus(trackedStatus.Document.Status))
                {
                    _logger.LogInformation("Restore already in terminal state ({Status}), skipping re-execution - OperationId: {OperationId}",
                        trackedStatus.Document.Status, message.OperationId);
                    return;
                }

                if (!string.Equals(trackedStatus.Document.Status, ToStatusString(Common.RestoreOperationStatus.InProgress), StringComparison.Ordinal))
                {
                    trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.InProgress);
                    trackedStatus = await _statusStorage.SaveStatusAsync(tenant, trackedStatus, ct);
                    _logger.LogInformation("Restore status set to InProgress - OperationId: {OperationId}", message.OperationId);
                }
            }

            // --- 3. Resolve storage location from current metadata ---

            DatasetStorageInfo storageInfo;
            try
            {
                storageInfo = await _datasetStorageInfoProvider.ResolveDatasetInfoAsync(
                    message.SdPath,
                    message.RestorePointInTime,
                    message.OperationId,
                    ct);

                _logger.LogInformation(
                    "Storage location resolved - Container: {Container}, ExpectedObjectCount: {ExpectedObjectCount}, OperationId: {OperationId}",
                    storageInfo.ContainerName, storageInfo.ExpectedObjectCount, message.OperationId);

            }
            catch (RestoreRejectedException)
            {
                // Request-level rejection (restore point out of range or a live-window no-op).
                // Nothing has been mutated. Let the outer handler mark the operation Rejected;
                // do NOT record it as a storage-resolution failure here.
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to resolve storage location - OperationId: {OperationId}, Error: {Error}",
                    message.OperationId, ex.Message);
                trackedStatus.Document.ErrorDetails = $"Failed to resolve storage location: {ex.Message}";
                trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                trackedStatus = await _statusStorage.SaveStatusAsync(tenant, trackedStatus, ct);
                throw;
            }

            // --- 3b. Ensure container exists (dataset access policy) ---
            // Under the 'dataset' access policy the dataset owns a dedicated container that is
            // deleted with the dataset. Restoring a deleted dataset must first undelete that
            // soft-deleted container, otherwise the blob PITR below has no container to target.
            try
            {
                await _containerRestoreService.EnsureContainerAvailableAsync(
                    tenant,
                    storageInfo,
                    message.OperationId,
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Container availability check/undelete failed - OperationId: {OperationId}, Error: {Error}",
                    message.OperationId, ex.Message);
                trackedStatus.Document.ErrorDetails = $"Container undelete failed: {ex.Message}";
                trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                trackedStatus = await _statusStorage.SaveStatusAsync(tenant, trackedStatus, ct);
                throw;
            }

            // --- 4a. Start (or resume) blob restore (storage must be ready first) ---
            // A failure BEFORE a restore id is issued (invalid timestamp, retention window,
            // resource resolution) leaves nothing mutated and is a SAFE failure: mark Failed and
            // release locks. Once a restore id exists, blobs may be mutated, so any later failure is
            // potentially inconsistent and is handled via RestoreRetryableException below.
            string blobRestoreId;
            try
            {
                blobRestoreMayHaveStarted = true;
                blobRestoreId = await _blobRestoreService.StartBlobRestoreAsync(
                    tenant,
                    storageInfo,
                    message.RestorePointInTime,
                    message.OperationId,
                    trackedStatus.Document.BlobRestoreId,
                    ct);
                blobRestoreMayHaveStarted = !string.IsNullOrEmpty(blobRestoreId);
            }
            catch (Common.Exceptions.RetryableRestoreException ex)
            {
                // A concurrent/in-flight PITR could not yet be adopted (only one blob-range restore
                // is allowed per account at a time). Nothing of ours has been mutated, but the
                // correct recovery is to resume on redelivery rather than fail permanently. Keep
                // status InProgress and retry at the queue level.
                _logger.LogWarning(ex,
                    "Blob restore hit a retryable condition while starting; will resume on redelivery - OperationId: {OperationId}",
                    message.OperationId);
                trackedStatus.Document.ErrorDetails = $"Blob restore start deferred (will retry): {ex.Message}";
                await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                throw new RestoreRetryableException("Blob restore could not be started yet", ex);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Blob restore could not be started - OperationId: {OperationId}, Error: {Error}",
                    message.OperationId, ex.Message);
                trackedStatus.Document.ErrorDetails = $"Blob restore could not be started: {ex.Message}";
                trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                trackedStatus = await _statusStorage.SaveStatusAsync(tenant, trackedStatus, ct);
                throw;
            }

            // Persist the restore id as the mutation checkpoint BEFORE the (potentially hours-long)
            // wait so a redelivered message resumes the same restore instead of starting a new one.
            if (!string.IsNullOrEmpty(blobRestoreId) &&
                !string.Equals(blobRestoreId, trackedStatus.Document.BlobRestoreId, StringComparison.Ordinal))
            {
                trackedStatus.Document.BlobRestoreId = blobRestoreId;
                try
                {
                    trackedStatus = await _statusStorage.SaveStatusAsync(tenant, trackedStatus, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex,
                        "Blob restore started but recording its restore id failed; retaining locks and retrying - RestoreId: {RestoreId}, OperationId: {OperationId}",
                        blobRestoreId, message.OperationId);
                    throw new RestoreRetryableException("Failed to record the blob restore id", ex);
                }
                _logger.LogInformation("Blob restore id persisted - RestoreId: {RestoreId}, OperationId: {OperationId}",
                    blobRestoreId, message.OperationId);
            }

            // --- 4b. Wait for blob restore to complete ---
            try
            {
                var blobRestoreResult = await _blobRestoreService.WaitForBlobRestoreAsync(
                    tenant,
                    storageInfo,
                    blobRestoreId,
                    message.RestorePointInTime,
                    message.OperationId,
                    ct);

                _logger.LogInformation(
                    "Blob restore completed successfully - Total: {Total}, Restored: {Restored}, OperationId: {OperationId}",
                    blobRestoreResult.TotalBlobs, blobRestoreResult.RestoredBlobs, message.OperationId);
            }
            catch (BlobRestoreFailedException ex)
            {
                _logger.LogError(ex, "Blob restore failed terminally - OperationId: {OperationId}", message.OperationId);
                trackedStatus.Document.ErrorDetails = ex.Message;
                trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                trackedStatus.Document.CompletedAt = DateTimeExtensions.UtcNowISOString();
                await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                throw new RestoreManualRecoveryException(
                    "Blob restore failed after Azure began mutating the account", ex);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (IsNonRetriable(ex))
                {
                    _logger.LogError(ex,
                        "Blob restore hit a non-retriable error after PITR started; retaining locks for manual recovery - OperationId: {OperationId}, Error: {Error}",
                        message.OperationId, ex.Message);
                    trackedStatus.Document.ErrorDetails = $"Blob restore did not complete (non-retriable): {ex.Message}";
                    trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                    trackedStatus.Document.CompletedAt = DateTimeExtensions.UtcNowISOString();
                    await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                    throw new RestoreManualRecoveryException(
                        "Blob restore did not complete because of a non-retriable error", ex);
                }

                // Blobs may already be (partially) restored while the wait failed/timed out.
                // Keep status InProgress and retry at the queue level.
                _logger.LogError(ex, "Blob restore did not complete - OperationId: {OperationId}, Error: {Error}",
                    message.OperationId, ex.Message);
                trackedStatus.Document.ErrorDetails = $"Blob restore did not complete (will retry): {ex.Message}";
                // Best-effort: a status-write failure here must NOT escape and land in the generic
                // catch, which would RELEASE the locks. The retain-locks RestoreRetryableException
                // must always be what propagates. See TryPersistStatusAsync.
                await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                throw new RestoreRetryableException("Blob restore did not complete", ex);
            }

            // --- 5. Finalize metadata restore (activation/commit point) ---
            try
            {
                await _generalPipeline.ExecuteAsync(
                    async token => await _metadataRestoreService.FinalizeRestoreAsync(
                        message.SdPath,
                        message.RestorePointInTime,
                        message.OperationId,
                        token).ConfigureAwait(false),
                    ct).ConfigureAwait(false);

                _logger.LogInformation(
                    "Metadata restore finalized - OperationId: {OperationId}",
                    message.OperationId);
            }
            catch (RestoreRejectedException ex)
            {
                trackedStatus.Document.ErrorDetails =
                    $"Metadata restore was rejected after blob restore completed; manual recovery required: {ex.Message}";
                trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                trackedStatus.Document.CompletedAt = DateTimeExtensions.UtcNowISOString();
                await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                throw new RestoreManualRecoveryException(
                    "Metadata restore was rejected after blob restore completed", ex);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (IsNonRetriable(ex))
                {
                    // deterministic failure (e.g. 403 KeyBasedAuthenticationNotPermitted). Redelivery
                    // would fail identically, so retrying only wastes attempts before dead-lettering.
                    // The dataset is potentially inconsistent, so RETAIN both locks (it stays
                    // inaccessible) but mark the operation terminally Failed and STOP redelivery;
                    // recovery requires manual intervention.
                    _logger.LogError(ex,
                        "Metadata restore finalization hit a non-retriable error (post-blob-restore); retaining locks and marking terminal for manual recovery - OperationId: {OperationId}, Error: {Error}",
                        message.OperationId, ex.Message);
                    trackedStatus.Document.ErrorDetails =
                        $"Metadata restore finalization failed (non-retriable, manual recovery required): {ex.Message}";
                    trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                    trackedStatus.Document.CompletedAt = DateTimeExtensions.UtcNowISOString();
                    // Best-effort: a status-write failure here must NOT escape and land in the generic
                    // catch, which would RELEASE the locks. The retain-locks RestoreManualRecoveryException
                    // must always be what propagates. See TryPersistStatusAsync.
                    await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                    throw new RestoreManualRecoveryException("Metadata restore finalization failed (non-retriable)", ex);
                }

                // Blob restore already succeeded but metadata could not be finalized due to a
                // transient error: the dataset is potentially inconsistent. Retain locks and retry
                // at the queue level to allow idempotent recovery/resume (bounded by MaxDequeueCount).
                _logger.LogError(ex,
                    "Metadata restore finalization failed (post-blob-restore); retaining locks and retrying at queue level - OperationId: {OperationId}, Error: {Error}",
                    message.OperationId, ex.Message);
                trackedStatus.Document.ErrorDetails = $"Metadata restore finalization failed (will retry): {ex.Message}";
                // Best-effort: a status-write failure here must NOT escape and land in the generic
                // catch, which would RELEASE the locks. The retain-locks RestoreRetryableException
                // must always be what propagates. See TryPersistStatusAsync.
                await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                throw new RestoreRetryableException("Metadata restore finalization failed", ex);
            }

            // --- 6. Run consistency validation ---
            try
            {
                var validationResult = await _generalPipeline.ExecuteAsync(
                    async token => await _blobRestoreService.ValidateConsistencyAsync(
                        tenant,
                        storageInfo,
                        message.OperationId,
                        token).ConfigureAwait(false),
                    ct).ConfigureAwait(false);

                if (!validationResult.IsConsistent)
                {
                    _logger.LogError(
                        "Consistency validation failed - {Error}, OperationId: {OperationId}",
                        validationResult.ValidationError, message.OperationId);

                    // Metadata and blob state do not agree: potentially inconsistent. Keep status
                    // InProgress and retry at the queue level.
                    trackedStatus.Document.ErrorDetails =
                        $"Consistency validation failed (will retry): {validationResult.ValidationError}";
                    // Best-effort: a status-write failure here must NOT escape and land in the generic
                    // catch, which would RELEASE the locks. The retain-locks RestoreRetryableException
                    // must always be what propagates. See TryPersistStatusAsync.
                    await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                    throw new RestoreRetryableException(
                        $"Consistency validation failed: {validationResult.ValidationError}");
                }

                _logger.LogInformation(
                    "Consistency validation succeeded - OperationId: {OperationId}",
                    message.OperationId);

            }
            catch (RestoreRetryableException)
            {
                throw;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (IsNonRetriable(ex))
                {
                    _logger.LogError(ex,
                        "Consistency validation hit a non-retriable error after restore; retaining locks for manual recovery - OperationId: {OperationId}, Error: {Error}",
                        message.OperationId, ex.Message);
                    trackedStatus.Document.ErrorDetails = $"Consistency validation error (non-retriable): {ex.Message}";
                    trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Failed);
                    trackedStatus.Document.CompletedAt = DateTimeExtensions.UtcNowISOString();
                    await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                    throw new RestoreManualRecoveryException(
                        "Consistency validation failed because of a non-retriable error", ex);
                }

                // Validation could not be executed after restore: cannot prove consistency.
                // Keep status InProgress and retry at the queue level.
                _logger.LogError(ex, "Consistency validation failed - OperationId: {OperationId}, Error: {Error}",
                    message.OperationId, ex.Message);
                trackedStatus.Document.ErrorDetails = $"Consistency validation error (will retry): {ex.Message}";
                // Best-effort: a status-write failure here must NOT escape and land in the generic
                // catch, which would RELEASE the locks. The retain-locks RestoreRetryableException
                // must always be what propagates. See TryPersistStatusAsync.
                await TryPersistStatusAsync(tenant, trackedStatus, message.OperationId, ct);
                throw new RestoreRetryableException("Consistency validation error", ex);
            }

            // --- 7. Mark Succeeded (if no failures occurred) ---
            if (string.Equals(trackedStatus.Document.Status, ToStatusString(Common.RestoreOperationStatus.InProgress), StringComparison.Ordinal))
            {
                trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Succeeded);
                trackedStatus.Document.CompletedAt = DateTimeExtensions.UtcNowISOString();

                // The restore itself is COMPLETE and consistent here; only the terminal status record
                // remains. Absorb short transient blips (Cosmos 429/503/timeout) in-code via the
                // pipeline, and if the write still fails, classify it as retryable rather than letting
                // it fall into the generic catch — that would wrongly mark a fully-successful restore
                // as Failed and release the locks. On redelivery the executor resumes idempotently
                // (status still InProgress, blob restore id persisted) and re-attempts this write.
                try
                {
                    trackedStatus = await _generalPipeline.ExecuteAsync(
                        async token => await _statusStorage.SaveStatusAsync(tenant, trackedStatus, token).ConfigureAwait(false),
                        ct).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex,
                        "Restore completed but recording the Succeeded status failed; retaining locks and retrying at queue level - OperationId: {OperationId}, Error: {Error}",
                        message.OperationId, ex.Message);
                    throw new RestoreRetryableException("Failed to record Succeeded status", ex);
                }

                _logger.LogInformation("Restore succeeded - OperationId: {OperationId}", message.OperationId);
            }
        }
        catch (OperationCanceledException)
        {
            if (blobRestoreMayHaveStarted)
            {
                retainLocksForRetry = true;
                _logger.LogWarning(
                    "Restore cancelled after blob PITR may have started; retaining locks for redelivery - OperationId: {OperationId}",
                    message.OperationId);
                await MakeLocksIndefiniteAsync(
                    datasetLockSession, datasetLockKey, operationLockKey, message.OperationId);
            }
            else
            {
                _logger.LogWarning(
                    "Restore cancelled before blob PITR started - OperationId: {OperationId}",
                    message.OperationId);
            }
            throw;
        }
        catch (RestoreRejectedException ex)
        {
            // SAFE, request-level rejection raised on the read side BEFORE any blob/metadata
            // mutation (restore point out of range, or inside the current live window where the
            // dataset already reflects that state). Mark the operation Rejected (terminal), release
            // locks in the finally, and swallow so the queue deletes the message instead of retrying.
            _logger.LogWarning(ex,
                "Restore rejected — {Reason}. OperationId: {OperationId}",
                ex.Message, message.OperationId);

            await SetStatusAsync(message, Common.RestoreOperationStatus.Rejected, ct, ex.Message);
        }
        catch (RestoreRetryableException ex)
        {
            // POTENTIALLY INCONSISTENT failure: one restore track may have completed while another
            // failed (e.g. blobs restored but metadata finalization failed, or consistency could not
            // be proven). Retain BOTH the dataset and operation locks and rethrow so the message is
            // redelivered and retried at the queue level (bounded by MaxDequeueCount). On redelivery
            // the executor re-acquires its own dataset lock idempotently (wid match) and resumes from
            // the persisted blob restore id. Status is left InProgress; if all queue retries are
            // exhausted the message is dead-lettered with locks still held, requiring manual recovery.
            retainLocksForRetry = true;
            _logger.LogError(ex,
                "Restore left in a potentially inconsistent state; retaining locks and retrying at queue level - OperationId: {OperationId}, Error: {Error}",
                message.OperationId, ex.Message);
            await MakeLocksIndefiniteAsync(
                datasetLockSession, datasetLockKey, operationLockKey, message.OperationId);
            throw;
        }
        catch (RestoreManualRecoveryException ex)
        {
            // POTENTIALLY INCONSISTENT + non-retriable failure after blobs were restored: retrying
            // would fail identically, so we STOP redelivery (swallow so the queue deletes the
            // message and no futile attempts are made) but RETAIN both locks so the dataset stays
            // inaccessible until an operator completes recovery. The status was already set to
            // terminal Failed with a manual-recovery error detail at the throw site.
            retainLocksForRetry = true;
            _logger.LogError(ex,
                "Restore left in a potentially inconsistent state by a non-retriable error; retaining locks and stopping redelivery for manual recovery - OperationId: {OperationId}, Error: {Error}",
                message.OperationId, ex.Message);
            await MakeLocksIndefiniteAsync(
                datasetLockSession, datasetLockKey, operationLockKey, message.OperationId);
            // Intentionally not rethrown: the message is deleted (no retries); locks remain held.
        }
        catch (Exception ex)
        {
            // SAFE failure: occurred before any blob/metadata mutation (validation, retention window,
            // storage resolution, container undelete, or blob restore that never started). Mark
            // Failed and let the queue redeliver; the terminal status short-circuits re-execution.
            _logger.LogError(ex, "Restore failed - OperationId: {OperationId}, Error: {Error}",
                message.OperationId, ex.Message);

            await SetStatusAsync(message, Common.RestoreOperationStatus.Failed, ct);
            throw; // re-throw so StorageQueueWorker increments DequeueCount / DLQs
        }
        finally
        {
            // --- 8. Release dataset and operation locks (unless retained for a queue-level retry) ---
            if (retainLocksForRetry)
            {
                _logger.LogWarning(
                    "Retaining dataset and operation locks pending retry/recovery - DatasetLockKey: {DatasetLockKey}, OperationLockKey: {OperationLockKey}, OperationId: {OperationId}",
                    datasetLockKey, operationLockKey, message.OperationId);
            }
            else
            {
                await ReleaseLockAsync(datasetLockSession, "dataset");
                await ReleaseOperationLockAsync(operationLockKey, operationLockId);
            }
        }
    }

    private async Task SetStatusAsync(IRestoreOperationMessage message, Common.RestoreOperationStatus status, CancellationToken ct, string? errorDetailsOverride = null)
    {
        try
        {
            var tenant = ExtractTenantFromSdPath(message.SdPath);
            var statusText = ToStatusString(status);
            var errorDetails = errorDetailsOverride ?? status switch
            {
                Common.RestoreOperationStatus.Rejected => "Restore rejected before any changes were made.",
                Common.RestoreOperationStatus.Failed => "Restore operation failed.",
                _ => null
            };

            var existing = await _statusStorage.GetRestoreOperationStatusAsync(
                tenant, message.OperationId, ct);

            if (existing is not null)
            {
                existing.Document.Status = statusText;
                existing.Document.ErrorDetails = existing.Document.ErrorDetails ?? errorDetails;
                if (IsTerminalStatus(statusText))
                {
                    existing.Document.CompletedAt ??= DateTimeExtensions.UtcNowISOString();
                }
                _ = await _statusStorage.SaveStatusAsync(tenant, existing, ct);
            }
            else
            {
                var path = ParseSdPath(message.SdPath);
                var newStatus = new Common.Model.RestoreOperationStatus
                {
                    OperationId = message.OperationId,
                    CreatedBy = message.CreatedBy,
                    SdPath = message.SdPath,
                    Tenant = path.Tenant,
                    Subproject = path.Subproject,
                    RestorePointInTime = message.RestorePointInTime,
                    CorrelationId = message.CorrelationId,
                    Status = statusText,
                    ErrorDetails = errorDetails,
                    CompletedAt = IsTerminalStatus(statusText)
                        ? DateTimeExtensions.UtcNowISOString()
                        : null,
                };
                _ = await _statusStorage.CreateStatusAsync(tenant, newStatus, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update restore status to '{Status}' - OperationId: {OperationId}",
                status, message.OperationId);
        }
    }

    /// <summary>
    /// Best-effort status persistence for use INSIDE a post-mutation failure handler that is about
    /// to throw a retain-locks exception (<see cref="RestoreRetryableException"/> or
    /// <see cref="RestoreManualRecoveryException"/>).
    ///
    /// At these call sites the dataset may already be partially mutated, so the outer handler relies
    /// on the thrown exception TYPE to decide it must RETAIN the locks. If the status write itself
    /// failed and were allowed to propagate, that raw exception would replace the intended typed one
    /// and surface at the generic <c>catch (Exception)</c> — which is reserved for SAFE pre-mutation
    /// failures and RELEASES the locks — silently downgrading "retain locks" into "release locks" and
    /// exposing a potentially inconsistent dataset. To prevent that classification flip, any failure
    /// to persist the status here is swallowed (logged only); the caller's typed exception is always
    /// what propagates. Losing the status write is acceptable: on a retry the message is reprocessed
    /// and the status re-read, and for the manual-recovery path the operation simply remains visible
    /// as in-progress (still blocking new restores) with the locks retained for the operator.
    /// </summary>
    private async Task TryPersistStatusAsync(string tenant, TrackedRestoreStatus trackedStatus, string operationId, CancellationToken ct)
    {
        try
        {
            _ = await _statusStorage.SaveStatusAsync(tenant, trackedStatus, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to persist restore status inside a post-mutation failure handler; continuing with the intended retain-locks classification - OperationId: {OperationId}",
                operationId);
        }
    }

    private static string ToStatusString(Common.RestoreOperationStatus status) => status.ToString();

    private static bool IsTerminalStatus(string status) =>
        string.Equals(status, ToStatusString(Common.RestoreOperationStatus.Succeeded), StringComparison.Ordinal) ||
        string.Equals(status, ToStatusString(Common.RestoreOperationStatus.Failed), StringComparison.Ordinal) ||
        string.Equals(status, ToStatusString(Common.RestoreOperationStatus.Rejected), StringComparison.Ordinal);

    private static string ExtractTenantFromSdPath(string sdPath) => ParseSdPath(sdPath).Tenant;

    private static SdPathParts ParseSdPath(string sdPath)
    {
        if (string.IsNullOrWhiteSpace(sdPath) || !sdPath.StartsWith("sd://", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException($"Invalid sdPath format: '{sdPath}'. Expected format: sd://<tenant>/<subproject>/...", nameof(sdPath));
        }

        var tokens = sdPath[5..].Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length < 3)
        {
            throw new ArgumentException($"Invalid dataset sdPath format: '{sdPath}'. Expected format: sd://<tenant>/<subproject>/<path>/<dataset>.", nameof(sdPath));
        }

        var tenant = tokens[0];
        var subproject = tokens[1];
        var dataset = tokens[^1];
        var pathTokens = tokens.Skip(2).Take(tokens.Length - 3).ToArray();
        var path = pathTokens.Length == 0 ? "/" : "/" + string.Join('/', pathTokens) + "/";

        return new SdPathParts(tenant, subproject, path, dataset);
    }

    private async Task<bool> DatasetExistsAsync(SdPathParts sdPathParts, string operationId, CancellationToken ct)
    {
        var endpoint = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(sdPathParts.Tenant, ct);
        const string query = @"SELECT TOP 1 c.id FROM c
WHERE c.data.tenant = @tenant
    AND c.data.subproject = @subproject
    AND c.data.path = @path
    AND c.data.name = @name";

        var parameters = JsonConvert.SerializeObject(new List<Parameter>
        {
            new() { Name = "@tenant", Value = sdPathParts.Tenant },
            new() { Name = "@subproject", Value = sdPathParts.Subproject },
            new() { Name = "@path", Value = sdPathParts.Path },
            new() { Name = "@name", Value = sdPathParts.Dataset },
        });

        var records = await _dataAccess.GetRecordsAsync(endpoint, query, parameters, null, 1, operationId);
        return records.records is { Count: > 0 };
    }

    private static string GetDatasetLockKey(SdPathParts sdPathParts) =>
        $"{sdPathParts.Tenant}/{sdPathParts.Subproject}{sdPathParts.Path}{sdPathParts.Dataset}";

    private async Task ReleaseOperationLockAsync(string operationLockKey, string operationId)
    {
        var operationLockSession = new WriteLockSession
        {
            Key = operationLockKey,
            Wid = operationId,
            Locked = true,
            IsIdempotent = true,
        };

        await ReleaseLockAsync(operationLockSession, "operation");
    }

    /// <summary>
    /// Best-effort conversion of the dataset and partition operation locks into indefinite locks.
    /// The lock manager verifies each lock's current owner before removing its TTL.
    /// </summary>
    private async Task MakeLocksIndefiniteAsync(
        WriteLockSession? datasetLockSession,
        string datasetLockKey,
        string operationLockKey,
        string operationId)
    {
        await MakeLockIndefiniteAsync(
            datasetLockSession, "dataset", datasetLockKey, operationId);
        await MakeLockIndefiniteAsync(
            new WriteLockSession
            {
                Key = operationLockKey,
                Wid = operationId,
                Locked = true,
                IsIdempotent = true,
            },
            "operation",
            operationLockKey,
            operationId);
    }

    private async Task MakeLockIndefiniteAsync(
        WriteLockSession? lockSession,
        string lockType,
        string lockKey,
        string operationId)
    {
        if (lockSession?.Locked != true)
        {
            return;
        }

        try
        {
            var persisted = await _lockManager.MakeWriteLockIndefiniteAsync(lockSession);
            if (persisted)
            {
                _logger.LogWarning(
                    "Restore {LockType} lock made indefinite pending retry or recovery - LockKey: {LockKey}, OperationId: {OperationId}",
                    lockType, lockKey, operationId);
            }
            else
            {
                _logger.LogError(
                    "Failed to make restore {LockType} lock indefinite; it may expire via TTL - LockKey: {LockKey}, OperationId: {OperationId}",
                    lockType, lockKey, operationId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error making restore {LockType} lock indefinite; it may expire via TTL - LockKey: {LockKey}, OperationId: {OperationId}",
                lockType, lockKey, operationId);
        }
    }

    private async Task ReleaseLockAsync(WriteLockSession? lockSession, string lockType)
    {
        if (lockSession?.Locked != true)
        {
            return;
        }

        try
        {
            var released = await _lockManager.RemoveWriteLockAsync(lockSession);
            if (released)
            {
                _logger.LogInformation("Restore {LockType} lock released - LockKey: {LockKey}", lockType, lockSession.Key);
            }
            else
            {
                _logger.LogInformation("No matching restore {LockType} lock to release - LockKey: {LockKey}", lockType, lockSession.Key);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to release restore {LockType} lock — will expire via TTL. LockKey: {LockKey}", lockType, lockSession.Key);
        }
    }

    private sealed record SdPathParts(string Tenant, string Subproject, string Path, string Dataset);

    /// <summary>
    /// Classifies an exception as permanently non-retriable. Some post-mutation failures — notably
    /// storage/auth errors such as 403 <c>KeyBasedAuthenticationNotPermitted</c> — are deterministic:
    /// the identical request fails the same way on every redelivery. Retrying them at the queue level
    /// only keeps the dataset and operation locks held until the message is dead-lettered. Such errors
    /// are routed to the terminal <c>Failed</c> path instead so the locks are released immediately.
    ///
    /// Two SDK exception families are inspected:
    ///   - <see cref="Azure.RequestFailedException"/> from the Storage plane, scoped to specific,
    ///     self-evidently permanent auth ErrorCodes rather than the bare HTTP status, because a plain
    ///     403 there can be transient during RBAC role propagation for a managed identity.
    ///   - <see cref="Microsoft.Azure.Cosmos.CosmosException"/> from the Cosmos plane, which the
    ///     Cosmos SDK throws instead of <see cref="Azure.RequestFailedException"/>. A finalize-stage
    ///     Cosmos 400 (malformed request) or 403 (authorization denied) is deterministic — the same
    ///     request re-fails identically on every redelivery. By the time finalize runs, this same
    ///     identity has already performed earlier-stage Cosmos writes successfully, so a 403 here is
    ///     a genuine permission failure, not RBAC-propagation transience.
    ///
    /// One inner-exception level is inspected because the SDK call may be wrapped before it surfaces.
    /// </summary>
    private static bool IsNonRetriable(Exception ex)
    {
        var rfe = ex as Azure.RequestFailedException
            ?? ex.InnerException as Azure.RequestFailedException;

        if (rfe is not null
            && rfe.ErrorCode is "KeyBasedAuthenticationNotPermitted"
                             or "AuthenticationFailed"
                             or "InsufficientAccountPermissions")
        {
            return true;
        }

        var cosmos = ex as Microsoft.Azure.Cosmos.CosmosException
            ?? ex.InnerException as Microsoft.Azure.Cosmos.CosmosException;

        return cosmos is not null
            && cosmos.StatusCode is System.Net.HttpStatusCode.BadRequest
                                 or System.Net.HttpStatusCode.Forbidden;
    }

    /// <summary>
    /// Signals a failure that may have left the dataset in a potentially inconsistent state
    /// (one restore track completed while another failed, or consistency could not be proven).
    /// When this is thrown, the executor retains the dataset and operation locks and rethrows so
    /// the queue redelivers and retries the message (bounded by MaxDequeueCount).
    /// </summary>
    private sealed class RestoreRetryableException(string message, Exception? innerException = null)
        : Exception(message, innerException)
    {
    }

    /// <summary>
    /// Signals a non-retriable failure that occurred AFTER blobs were restored, leaving the dataset
    /// potentially inconsistent. The executor retains both locks (the dataset stays inaccessible) and
    /// marks the operation terminally Failed, but does NOT rethrow — the queue deletes the message so
    /// no futile retries are attempted. Recovery requires manual intervention.
    /// </summary>
    private sealed class RestoreManualRecoveryException(string message, Exception? innerException = null)
        : Exception(message, innerException)
    {
    }
}
