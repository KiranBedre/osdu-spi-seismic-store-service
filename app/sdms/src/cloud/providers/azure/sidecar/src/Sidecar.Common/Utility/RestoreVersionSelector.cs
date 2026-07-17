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

namespace Sidecar.Common.Utility;

/// <summary>
/// Outcome of deciding which dataset version a point-in-time restore should use, given the
/// archive-interval-first lookup result and the live document's lifecycle bounds.
/// </summary>
public enum RestoreVersionDecision
{
    /// <summary>
    /// An archived snapshot's half-open window [versionCreatedAt, archivedAt) contains the restore
    /// point; restore from that snapshot.
    /// </summary>
    UseArchivedSnapshot,

    /// <summary>
    /// No archived version covers the restore point and the dataset is live with the point falling
    /// in the current (still-unarchived) version's window. The live document already reflects the
    /// state at that instant, so there is nothing to restore and the request is rejected rather than
    /// re-archiving and re-writing the current version onto itself.
    /// </summary>
    RejectRestorePointInLiveWindow,

    /// <summary>
    /// The restore point is at or before the live version's creation, so it belongs to an earlier
    /// lifecycle (or predates the dataset). Point-in-time restore is scoped to the current lifecycle.
    /// </summary>
    RejectBeforeCreation,

    /// <summary>
    /// The dataset is live but the restore point falls before the current version began, in a period
    /// with no live version (a deletion gap the archive did not cover).
    /// </summary>
    RejectNoLiveVersion,

    /// <summary>
    /// The dataset is deleted and no archived version covers the restore point, so no version existed
    /// at that instant (an earlier life, a deletion gap, or before the dataset ever existed).
    /// </summary>
    RejectDeletedNoVersion,
}

/// <summary>
/// Pure decision logic for point-in-time restore version selection. Given the archive-lookup
/// result and the live document's lifecycle bounds, decides whether to restore from an archived
/// snapshot or to reject the restore point (out of range, or inside the current live window where
/// the dataset already reflects that state and there is nothing to restore). Kept side effect free
/// (no Cosmos, no clock) so the branching can be exercised with table-driven tests.
/// </summary>
public static class RestoreVersionSelector
{
    /// <summary>
    /// Decides which version a restore should use. Selection is archive-interval-first: when an
    /// archived snapshot covers the restore point it always wins; otherwise a live dataset whose
    /// current version's window contains the point is rejected (the live document already reflects
    /// that state), as are points outside the current lifecycle's bounds.
    /// </summary>
    /// <param name="hasArchivedSnapshot">
    /// True when the archive lookup found a version whose window contains the restore point.
    /// </param>
    /// <param name="liveExists">True when the dataset still exists in the data container.</param>
    /// <param name="liveCreatedEpochMs">
    /// The live version's created_date as Unix epoch milliseconds (lifecycle start), or null when
    /// unknown. The restore point must be strictly after this.
    /// </param>
    /// <param name="liveVersionStartEpochMs">
    /// The live version's window start (last_modified_date, falling back to created_date) as Unix
    /// epoch milliseconds, or null when unknown. The restore point must be at or after this.
    /// </param>
    /// <param name="restorePointEpochMs">The requested restore point as Unix epoch milliseconds.</param>
    /// <returns>The selection outcome.</returns>
    public static RestoreVersionDecision Decide(
        bool hasArchivedSnapshot,
        bool liveExists,
        long? liveCreatedEpochMs,
        long? liveVersionStartEpochMs,
        long restorePointEpochMs)
    {
        // Archive-interval-first: a covering archived version always wins over the live fallback.
        if (hasArchivedSnapshot)
        {
            return RestoreVersionDecision.UseArchivedSnapshot;
        }

        if (liveExists)
        {
            // Reject points at/before creation (earlier lifecycle or pre-dataset).
            if (liveCreatedEpochMs is long createdMs && restorePointEpochMs <= createdMs)
            {
                return RestoreVersionDecision.RejectBeforeCreation;
            }

            // Reject points before the current version began (a deletion gap the archive did not cover).
            if (liveVersionStartEpochMs is long versionStartMs && restorePointEpochMs < versionStartMs)
            {
                return RestoreVersionDecision.RejectNoLiveVersion;
            }

            // The point falls in the current version's still-live window: the live document already
            // reflects that state, so there is nothing to restore. Reject rather than re-archiving
            // and re-writing the current version onto itself.
            return RestoreVersionDecision.RejectRestorePointInLiveWindow;
        }

        // Deleted dataset with no covering archived version: nothing existed at that instant.
        return RestoreVersionDecision.RejectDeletedNoVersion;
    }
}
