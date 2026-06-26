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
using Serilog.Context;
using Sidecar.Common;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Service;
using Sidecar.Common.Utility;

/// <summary>
/// Processes a single restore operation message from the Storage Queue.
///
/// Concurrency contract:
///   - Dataset lock key: {tenant}/{subproject}/{path}/{dataset}
///     Acquired only if dataset metadata exists at operation start.
///   - Operation lock is created upstream by Node.js and is never acquired here.
///     Sidecar only releases operation lock key restore-op-lock:{dataPartitionId}
///     with lock value operationId.
///   Dataset lock value uses operationId-based idempotent format.
///   A conflicting dataset lock results in status "Rejected", message discarded.
///
/// Restore stages (this class):
///   1. Acquire dataset Redis lock (conditional)
///   2. Create/verify Cosmos status document (InProgress)
///   3. Invoke MetadataRestoreService (STUB — archival design pending)
///   4. Mark status Succeeded / Failed
///   5. Release dataset lock and operation lock
///
/// Blob restore (PITR) is handled by a separate worker.
/// </summary>
public class RestoreTaskExecutor(
    ILogger<RestoreTaskExecutor> logger,
    ILockManager lockManager,
    IRestoreOperationStatusStorage statusStorage,
    IMetadataRestoreService metadataRestoreService,
    IDataAccess dataAccess,
    ICosmosClientFactory cosmosClientFactory)
    : ITaskExecutor<IRestoreOperationMessage>
{
    private readonly ILogger<RestoreTaskExecutor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly ILockManager _lockManager = lockManager ?? throw new ArgumentNullException(nameof(lockManager));
    private readonly IRestoreOperationStatusStorage _statusStorage = statusStorage ?? throw new ArgumentNullException(nameof(statusStorage));
    private readonly IMetadataRestoreService _metadataRestoreService = metadataRestoreService ?? throw new ArgumentNullException(nameof(metadataRestoreService));
    private readonly IDataAccess _dataAccess = dataAccess ?? throw new ArgumentNullException(nameof(dataAccess));
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));

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

        // --- 1. Acquire dataset lock if dataset exists ---
        // Operation lock is acquired upstream by Node.js and only released by this executor.
        var operationLockKey = $"restore-op-lock:{tenant}";
        var operationLockId = message.OperationId;
        var datasetLockKey = GetDatasetLockKey(sdPathParts);
        var datasetLockId = $"{Constants.WRITE_LOCK_PREFIX}{message.OperationId}:{datasetLockKey}";
        var lockTtl = TimeSpan.FromHours(Constants.RestoreConfiguration.LOCK_TTL_HOURS);
        var datasetExists = await DatasetExistsAsync(sdPathParts, message.OperationId, ct);
        WriteLockSession? datasetLockSession = null;

        if (datasetExists)
        {
            datasetLockSession = await _lockManager.AcquireWriteLockAsync(datasetLockKey, datasetLockId, lockTtl);
            if (!datasetLockSession.Locked)
            {
                _logger.LogWarning(
                    "Restore rejected — dataset lock is already held. DatasetLockKey: {DatasetLockKey}, OperationId: {OperationId}",
                    datasetLockKey, message.OperationId);

                await SetStatusAsync(message, Common.RestoreOperationStatus.Rejected, ct);
                return;
            }

            _logger.LogInformation("Restore dataset lock acquired - LockKey: {LockKey}, Idempotent: {IsIdempotent}",
                datasetLockKey, datasetLockSession.IsIdempotent);
        }
        else
        {
            _logger.LogInformation(
                "No active dataset metadata found for SdPath: {SdPath}. Skipping dataset lock acquisition. OperationId: {OperationId}",
                message.SdPath, message.OperationId);
        }

        try
        {
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

            // --- 3. Run metadata restore (STUB — throws NotImplementedException) ---
            await _metadataRestoreService.RestoreAsync(
                message.SdPath,
                message.RestorePointInTime,
                message.OperationId,
                ct);

            // --- 4. Mark Succeeded ---
            trackedStatus.Document.Status = ToStatusString(Common.RestoreOperationStatus.Succeeded);
            trackedStatus = await _statusStorage.SaveStatusAsync(tenant, trackedStatus, ct);

            _logger.LogInformation("Restore succeeded - OperationId: {OperationId}", message.OperationId);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Restore cancelled - OperationId: {OperationId}", message.OperationId);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Restore failed - OperationId: {OperationId}, Error: {Error}",
                message.OperationId, ex.Message);

            await SetStatusAsync(message, Common.RestoreOperationStatus.Failed, ct);
            throw; // re-throw so StorageQueueWorker increments DequeueCount / DLQs
        }
        finally
        {
            // --- 5. Release dataset and operation locks ---
            await ReleaseLockAsync(datasetLockSession, "dataset");
            await ReleaseOperationLockAsync(operationLockKey, operationLockId);
        }
    }

    private async Task SetStatusAsync(IRestoreOperationMessage message, Common.RestoreOperationStatus status, CancellationToken ct)
    {
        try
        {
            var tenant = ExtractTenantFromSdPath(message.SdPath);
            var statusText = ToStatusString(status);

            var existing = await _statusStorage.GetRestoreOperationStatusAsync(
                tenant, message.OperationId, ct);

            if (existing is not null)
            {
                existing.Document.Status = statusText;
                _ = await _statusStorage.SaveStatusAsync(tenant, existing, ct);
            }
            else
            {
                var newStatus = new Common.Model.RestoreOperationStatus
                {
                    OperationId = message.OperationId,
                    CreatedBy = message.CreatedBy,
                    SdPath = message.SdPath,
                    RestorePointInTime = message.RestorePointInTime,
                    CorrelationId = message.CorrelationId,
                    Status = statusText,
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
}
