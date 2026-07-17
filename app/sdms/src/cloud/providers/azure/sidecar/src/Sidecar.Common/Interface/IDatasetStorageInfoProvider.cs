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
/// Resolves the storage location for a dataset at a requested point-in-time, abstracting the
/// restore code from Cosmos query details.
/// <para>
/// Resolution is not a single primary-container lookup; it reconciles the live (primary) dataset
/// document with the archival snapshot history to pick the version that was active at the restore
/// point:
/// </para>
/// <list type="number">
/// <item>
/// Query the live data container for the dataset. Its presence/absence is the sole source of truth
/// for whether the dataset is currently deleted, and (when present) supplies the current version's
/// lifecycle bounds (created / last-modified dates).
/// </item>
/// <item>
/// Query the archival container for the snapshot whose half-open window
/// <c>[versionCreatedAt, archivedAt)</c> contains the restore point. This runs even for a live
/// dataset, because a past (already archived) version may have been the active one at the requested
/// instant.
/// </item>
/// <item>
/// Decide which version to return: prefer the archived snapshot when one covers the restore point,
/// otherwise fall back to the live version. Restore points inside the current live window, at/before
/// creation, or in a gap with no live version are rejected rather than restored.
/// </item>
/// </list>
/// The live projection and the archived snapshot expose gcsurl/filemetadata in the same shape, so
/// the returned <see cref="DatasetStorageInfo"/> is identical regardless of which source answered.
/// </summary>
public interface IDatasetStorageInfoProvider
{
    /// <summary>
    /// Resolves the dataset info needed by restore:
    /// storage container, optional folder prefix, and blob paths.
    /// Must support both active (primary) metadata and archived metadata records.
    /// </summary>
    /// <param name="sdPath">Full dataset SD path.</param>
    /// <param name="restorePointInTime">
    /// ISO-8601 point-in-time being restored to. Used to select the archived snapshot that was
    /// active at that instant when the dataset is not present in the primary (live) container.
    /// </param>
    /// <param name="operationId">Operation ID for correlation and logging.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<DatasetStorageInfo> ResolveDatasetInfoAsync(string sdPath, string restorePointInTime, string operationId, CancellationToken ct);
}
