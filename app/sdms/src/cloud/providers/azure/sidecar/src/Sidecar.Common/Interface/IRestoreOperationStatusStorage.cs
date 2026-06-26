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
/// Holds a RestoreOperationStatus document along with its ETag for optimistic concurrency.
/// </summary>
public record TrackedRestoreStatus(RestoreOperationStatus Document, string ETag);

public interface IRestoreOperationStatusStorage
{
    /// <summary>
    /// Gets an existing restore operation status by operation ID.
    /// Returns null if the document does not exist.
    /// </summary>
    Task<TrackedRestoreStatus?> GetRestoreOperationStatusAsync(string dataPartitionId, string operationId, CancellationToken ct);

    /// <summary>
    /// Creates the initial status document. Throws on conflict (already exists).
    ///
    /// Node API is expected to create this document first, but sidecar keeps this path
    /// as a resiliency fallback for missing/out-of-order status creation.
    /// Returns the TrackedRestoreStatus with the new ETag.
    /// </summary>
    Task<TrackedRestoreStatus> CreateStatusAsync(string dataPartitionId, RestoreOperationStatus status, CancellationToken ct);

    /// <summary>
    /// Saves the status document using ETag-based optimistic concurrency.
    /// Returns the updated TrackedRestoreStatus with the new ETag.
    /// Throws on ETag conflict — caller should re-read and retry.
    /// </summary>
    Task<TrackedRestoreStatus> SaveStatusAsync(string dataPartitionId, TrackedRestoreStatus trackedStatus, CancellationToken ct);
}
