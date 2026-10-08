// ============================================================================
// Copyright 2026, Microsoft Corporation
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
/// Service for archiving dataset metadata snapshots before mutations,
/// enabling point-in-time restore capability.
/// </summary>
public interface IArchiveService
{
    /// <summary>
    /// Archives the current state of a dataset before an update operation.
    /// No-op if the dataset doesn't exist or if archival is disabled.
    /// </summary>
    /// <param name="dataPartitionId">The data partition (tenant) identifier</param>
    /// <param name="id">The dataset ID (Cosmos document ID / partition key)</param>
    /// <param name="operation">The operation triggering archival (e.g., "change_tier")</param>
    /// <param name="operationId">Optional correlation ID for logging</param>
    Task ArchiveBeforeUpdateAsync(string dataPartitionId, string id, ArchiveOperation operation, string? operationId = null);

    /// <summary>
    /// Archives the current state of a dataset before a delete operation.
    /// No-op if the dataset doesn't exist or if archival is disabled.
    /// </summary>
    /// <param name="dataPartitionId">The data partition (tenant) identifier</param>
    /// <param name="id">The dataset ID (Cosmos document ID / partition key)</param>
    /// <param name="operationId">Optional correlation ID for logging</param>
    Task ArchiveBeforeDeleteAsync(string dataPartitionId, string id, string? operationId = null);
}
