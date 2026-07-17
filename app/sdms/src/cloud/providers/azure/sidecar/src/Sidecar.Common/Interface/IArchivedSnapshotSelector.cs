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
/// Single source of truth for point-in-time snapshot selection against the ArchiveDatasetMetadata
/// container.
///
/// Restore is a two-reader operation: one reader resolves the blob/storage location
/// (<see cref="IDatasetStorageInfoProvider"/>) and another rewrites the Cosmos document
/// (<see cref="IMetadataRestoreService"/>). Both MUST select the SAME archived version for a given
/// restore point, or a restore silently produces blob data from one version and metadata from
/// another. Centralizing the selection contract (two-sided window, lifecycle scoping, ordering,
/// partition key) here guarantees the two readers cannot diverge.
///
/// <para>
/// <b>Lifecycle key.</b> A single sdPath can be reused across multiple independent "lives": SDMS
/// derives the dataset id deterministically from the sdPath, so deleting a dataset and later
/// recreating it at the same path produces a fresh dataset that reuses the same id and archive
/// partition key. The archive therefore accumulates snapshots from several unrelated lives under
/// one sdPath, and their live windows can be adjacent or overlapping across a delete/recreate
/// boundary. The lifecycle key (the dataset's <c>datasetCreatedAtEpochMs</c>) tags every snapshot
/// with the life it belongs to and scopes selection to a single life:
/// </para>
/// <list type="bullet">
/// <item>
/// For a <b>live</b> dataset the key is the current document's created date, so selection considers
/// only versions from the life that is active now.
/// </item>
/// <item>
/// For a <b>deleted</b> dataset there is no live document to anchor the life, so the key is resolved
/// via <see cref="ResolveLatestLifecycleKeyAsync"/> (the most recent archived life).
/// </item>
/// </list>
/// <para>
/// Without this scope the two-sided window alone could match a version from a previous or later
/// life whose interval happens to surround the restore point, restoring data the caller never
/// intended. The lifecycle key confines a point-in-time restore to the intended incarnation of the
/// dataset.
/// </para>
/// </summary>
public interface IArchivedSnapshotSelector
{
    /// <summary>
    /// Selects the archived snapshot whose live window contained the restore point, scoped to a
    /// single lifecycle. Each snapshot describes the half-open interval
    /// [versionCreatedAt, archivedAt) during which it was live, so the active version is the one
    /// whose interval contains the restore point:
    /// <c>versionCreatedAt &lt;= restorePoint &lt; archivedAt</c>. The two-sided predicate prevents
    /// jumping across a deletion gap into an adjacent version, and the lifecycle filter keeps
    /// selection inside the target life. Returns null when no such snapshot exists (e.g. the
    /// restore point falls in the still-live, unarchived current window).
    /// </summary>
    /// <param name="endpoint">Resolved Cosmos connection endpoint for the dataset's tenant.</param>
    /// <param name="sdPath">Archive partition key: full SD dataset path.</param>
    /// <param name="restorePointEpochMs">Restore point in Unix epoch milliseconds (UTC).</param>
    /// <param name="lifecycleKey">
    /// Optional lifecycle scope (datasetCreatedAtEpochMs). When provided, selection is constrained
    /// to that single life; when null, the two-sided window alone determines the match.
    /// </param>
    /// <param name="operationId">Correlation ID for logging.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<ArchivedDatasetMetadata?> SelectSnapshotAsync(
        string endpoint, string sdPath, long restorePointEpochMs, long? lifecycleKey, string operationId, CancellationToken ct);

    /// <summary>
    /// Resolves the most recent archived lifecycle for the sdPath (the largest
    /// datasetCreatedAtEpochMs). Used to scope selection when the dataset has already been deleted
    /// and there is no live document to anchor the lifecycle. Returns null when the sdPath has no
    /// archived snapshots at all, leaving selection scoped by the two-sided window alone.
    /// </summary>
    /// <param name="endpoint">Resolved Cosmos connection endpoint for the dataset's tenant.</param>
    /// <param name="sdPath">Archive partition key: full SD dataset path.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<long?> ResolveLatestLifecycleKeyAsync(string endpoint, string sdPath, CancellationToken ct);

    /// <summary>
    /// Resolves the millisecond-precise instant the current (soon-to-be-archived) version became
    /// live: the largest <c>archivedAtEpochMs</c> among snapshots already archived for the same
    /// lifecycle. A version becomes live exactly when its predecessor is archived (archive-on-write),
    /// so the predecessor's window END is this version's window START. Callers use it as
    /// <c>versionCreatedAtEpochMs</c> to keep consecutive windows [versionCreatedAt, archivedAt)
    /// exactly contiguous and millisecond-precise (the live document's <c>_ts</c> is Unix seconds and
    /// would truncate, making adjacent windows overlap by up to 999 ms). Returns null when this is the
    /// first version of the lifecycle (no predecessor archived), in which case the caller falls back
    /// to the dataset's created date.
    /// </summary>
    /// <param name="endpoint">Resolved Cosmos connection endpoint for the dataset's tenant.</param>
    /// <param name="sdPath">Archive partition key: full SD dataset path.</param>
    /// <param name="lifecycleKey">Lifecycle scope (datasetCreatedAtEpochMs) the version belongs to.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<long?> ResolveLatestArchivedAtAsync(string endpoint, string sdPath, long lifecycleKey, CancellationToken ct);
}
