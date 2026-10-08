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

namespace Sidecar.Common.Tests.Utility;

using Sidecar.Common.Utility;

/// <summary>
/// Table-driven coverage for <see cref="RestoreVersionSelector.Decide"/>, the pure point-in-time
/// restore version-selection decision extracted from <c>CosmosDatasetStorageInfoProvider</c>.
/// Exercises every outcome and the epoch-millisecond boundaries between them (archive-interval-
/// first, then the current-lifecycle live fallback with its created/version-start lower bounds).
/// All timestamps are Unix epoch milliseconds.
/// </summary>
public class RestoreVersionSelectorTests
{
    private const long Created = 1_000L;
    private const long VersionStart = 2_000L;

    [Theory]
    // ---- Archive-interval-first: a covering archived snapshot always wins. ----
    // Live present, bounds populated: archive still wins over the live fallback.
    [InlineData(true, true, Created, VersionStart, 5_000L, RestoreVersionDecision.UseArchivedSnapshot)]
    // Deleted dataset but archive covers the point: restore from the snapshot.
    [InlineData(true, false, null, null, 5_000L, RestoreVersionDecision.UseArchivedSnapshot)]
    // Archive wins even when the point would otherwise be rejected as before-creation.
    [InlineData(true, true, Created, VersionStart, 500L, RestoreVersionDecision.UseArchivedSnapshot)]

    // ---- Use live metadata: blobs may change independently within this metadata window. ----
    // Point strictly after both bounds.
    [InlineData(false, true, Created, VersionStart, 5_000L, RestoreVersionDecision.UseLiveDocument)]
    // Boundary: point exactly at the version start is inside the window (>= start).
    [InlineData(false, true, Created, VersionStart, VersionStart, RestoreVersionDecision.UseLiveDocument)]
    // Both bounds unknown: no lower bound can reject on range, still inside the live window.
    [InlineData(false, true, null, null, 5_000L, RestoreVersionDecision.UseLiveDocument)]
    // Only version-start known and satisfied; created unknown.
    [InlineData(false, true, null, VersionStart, VersionStart, RestoreVersionDecision.UseLiveDocument)]
    // Only created known and satisfied; version-start unknown.
    [InlineData(false, true, Created, null, 1_001L, RestoreVersionDecision.UseLiveDocument)]

    // ---- Reject: at/before creation (earlier lifecycle or pre-dataset). ----
    // Boundary: point exactly at created_date is rejected (<= created).
    [InlineData(false, true, Created, VersionStart, Created, RestoreVersionDecision.RejectBeforeCreation)]
    // Point strictly before creation.
    [InlineData(false, true, Created, VersionStart, 500L, RestoreVersionDecision.RejectBeforeCreation)]
    // Before-creation is checked before the version-start guard when both would trip.
    [InlineData(false, true, Created, null, 500L, RestoreVersionDecision.RejectBeforeCreation)]

    // ---- Reject: no live version (deletion gap before the current version began). ----
    // Point after creation but strictly before the current version start.
    [InlineData(false, true, Created, VersionStart, 1_500L, RestoreVersionDecision.RejectNoLiveVersion)]
    // Created unknown so the before-creation guard is skipped; version-start guard trips.
    [InlineData(false, true, null, VersionStart, 1_999L, RestoreVersionDecision.RejectNoLiveVersion)]

    // ---- Reject: deleted dataset and no covering archived version. ----
    [InlineData(false, false, null, null, 5_000L, RestoreVersionDecision.RejectDeletedNoVersion)]
    // Deleted: stray live bounds are ignored (liveExists is false).
    [InlineData(false, false, Created, VersionStart, 5_000L, RestoreVersionDecision.RejectDeletedNoVersion)]
    public void Decide_ReturnsExpectedOutcome(
        bool hasArchivedSnapshot,
        bool liveExists,
        long? liveCreatedEpochMs,
        long? liveVersionStartEpochMs,
        long restorePointEpochMs,
        RestoreVersionDecision expected)
    {
        var decision = RestoreVersionSelector.Decide(
            hasArchivedSnapshot,
            liveExists,
            liveCreatedEpochMs,
            liveVersionStartEpochMs,
            restorePointEpochMs);

        _ = decision.Should().Be(expected);
    }
}
