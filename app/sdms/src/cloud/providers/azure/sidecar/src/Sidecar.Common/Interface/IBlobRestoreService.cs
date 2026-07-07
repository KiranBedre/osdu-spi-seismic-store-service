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

namespace Sidecar.Common.Interface;

using Sidecar.Common.Model;

/// <summary>
/// Restores dataset storage content to a prior state using storage-account Point-in-Time Restore (PITR).
/// Blob discovery stays metadata-driven, but the restore action itself is storage-specific.
/// </summary>
public interface IBlobRestoreService
{
    /// <summary>
    /// Starts (or resumes) the storage-account PITR restore for a dataset's blob range and
    /// returns its restore identifier. When <paramref name="existingRestoreId"/> is supplied
    /// (a redelivered/resumed operation) the account's current restore state is inspected: an
    /// in-progress or completed restore with that id is adopted without issuing a new request;
    /// otherwise a fresh restore is submitted. Returns an empty string when the dataset has no
    /// blobs to restore.
    ///
    /// The returned id must be persisted BEFORE awaiting completion so a message redelivery
    /// resumes the same restore (Azure serializes one restore per account).
    /// </summary>
    /// <param name="dataPartitionId">Data partition/tenant ID for blob storage access.</param>
    /// <param name="storageInfo">Pre-resolved storage location and blob paths from metadata stage.</param>
    /// <param name="restorePointInTime">ISO-8601 target restore timestamp.</param>
    /// <param name="operationId">Operation ID for correlation and idempotency.</param>
    /// <param name="existingRestoreId">Restore id persisted by a previous attempt, or null for a first attempt.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The restore identifier, or empty string when there is nothing to restore.</returns>
    Task<string> StartBlobRestoreAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string restorePointInTime,
        string operationId,
        string? existingRestoreId,
        CancellationToken ct);

    /// <summary>
    /// Waits for the storage-account PITR restore identified by <paramref name="restoreId"/> to
    /// complete. A newer restore id on the account is treated as completion (restores are
    /// serialized per account). An empty <paramref name="restoreId"/> completes immediately
    /// (nothing to restore).
    /// </summary>
    /// <param name="dataPartitionId">Data partition/tenant ID for blob storage access.</param>
    /// <param name="storageInfo">Pre-resolved storage location and blob paths from metadata stage.</param>
    /// <param name="restoreId">Restore id returned by <see cref="StartBlobRestoreAsync"/>.</param>
    /// <param name="operationId">Operation ID for correlation and idempotency.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Result containing aggregate restore counts.</returns>
    Task<BlobRestoreResult> WaitForBlobRestoreAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string restoreId,
        string operationId,
        CancellationToken ct);

    /// <summary>
    /// Validates that all blobs referenced in dataset metadata exist in blob storage
    /// after restore completion. Ensures consistency between metadata and blob state.
    /// </summary>
    /// <param name="dataPartitionId">Data partition/tenant ID.</param>
    /// <param name="storageInfo">Pre-resolved storage location and blob paths.</param>
    /// <param name="operationId">Operation ID for correlation.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Validation result with any missing blobs.</returns>
    Task<ConsistencyValidationResult> ValidateConsistencyAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string operationId,
        CancellationToken ct);
}

/// <summary>
/// Result of a blob restore operation.
/// </summary>
public class BlobRestoreResult
{
    /// <summary>
    /// Total number of blobs attempted for restore.
    /// </summary>
    public int TotalBlobs { get; set; }

    /// <summary>
    /// Number of blobs successfully restored.
    /// </summary>
    public int RestoredBlobs { get; set; }

}

/// <summary>
/// Result of consistency validation between metadata and blob state.
/// </summary>
public class ConsistencyValidationResult
{
    /// <summary>
    /// Indicates whether all metadata-referenced blobs exist in storage.
    /// </summary>
    public bool IsConsistent { get; set; }

    /// <summary>
    /// List of blobs referenced in metadata but not found in storage.
    /// </summary>
    public List<string> MissingBlobs { get; set; } = [];

    /// <summary>
    /// Error details if validation failed.
    /// </summary>
    public string? ValidationError { get; set; }
}
