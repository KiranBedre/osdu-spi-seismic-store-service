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

namespace Sidecar.Common.Model;

using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Linq;

/// <summary>
/// Point-in-time snapshot of a dataset metadata document, stored in the
/// ArchiveDatasetMetadata Cosmos container. Captures the live document together
/// with the timestamps needed to select the version active at a restore point.
/// </summary>
public class ArchivedDatasetMetadata
{
    /// <summary>
    /// Cosmos document ID. Composed as "{datasetId}__{datasetCreatedAtEpochMs}__{discriminator}" so
    /// each archived snapshot is unique across BOTH lifecycles and archive events: the middle
    /// segment (the lifecycle key) distinguishes a delete+recreate of the same deterministic
    /// datasetId, while the trailing discriminator distinguishes individual archive events within a
    /// life. The restore path uses the restore operationId as that discriminator so a redelivered
    /// or concurrent finalize of the same operation produces the identical id and is rejected as a
    /// 409 duplicate (idempotent) instead of writing a second snapshot under a fresh archivedAt.
    /// </summary>
    [JsonProperty("id")]
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Full SD dataset path this snapshot belongs to.
    /// </summary>
    [JsonProperty("sdPath")]
    public string SdPath { get; set; } = string.Empty;

    /// <summary>
    /// The restore operation that produced this snapshot. A restore is retried at the queue level,
    /// and archiving the current live document happens each time <c>FinalizeRestoreAsync</c> runs,
    /// so this field makes the archive step idempotent per operation. It is both the trailing
    /// discriminator of the document id (so a redelivered/concurrent finalize collides on the same
    /// id and is rejected as a 409 duplicate) and a cheap existence-check key used as a fast path to
    /// skip the write on the common retry case. Without it, retries would accumulate duplicate
    /// snapshots and could archive the already-restored state under a fresh archivedAt.
    /// </summary>
    [JsonProperty("operationId")]
    public string OperationId { get; set; } = string.Empty;

    /// <summary>
    /// The kind of mutation that triggered this snapshot (patch, bulk_delete, change_tier, restore).
    /// Serialized by member name so the wire value stays stable and readable across the .NET and
    /// TypeScript archival paths.
    /// </summary>
    [JsonProperty("operation")]
    [JsonConverter(typeof(StringEnumConverter))]
    public ArchiveOperation Operation { get; set; }

    /// <summary>
    /// Unix epoch milliseconds (UTC) marking the END of this version's live window — the instant
    /// the version was replaced or deleted and this snapshot was archived. Together with
    /// <see cref="VersionCreatedAtEpochMs"/> it forms the half-open interval [versionCreatedAtEpochMs, archivedAtEpochMs)
    /// during which this version was the live document. Point-in-time selection picks the version
    /// whose interval contains the restore point; this is the authoritative ordering field because
    /// writes are lock-serialized per dataset (unique, monotonic, millisecond-precise).
    /// </summary>
    [JsonProperty("archivedAtEpochMs")]
    public long ArchivedAtEpochMs { get; set; }

    /// <summary>
    /// Unix epoch milliseconds (UTC) marking the START of this version's live window — the instant
    /// the version became active in the data container. It is sourced from the predecessor
    /// snapshot's <see cref="ArchivedAtEpochMs"/> (the instant the previous version was replaced),
    /// so it is millisecond-precise and on the same clock as archivedAt and blob PITR. The first
    /// version of a lifecycle has no predecessor and falls back to the dataset's created date. Lower
    /// edge of the half-open interval [versionCreatedAt, archivedAt). Because every write archives
    /// the version it supersedes, consecutive windows are exactly contiguous, so a restore point
    /// maps to exactly one version; a point strictly before the lifecycle's first versionCreatedAt
    /// resolves to "did not exist" instead of jumping to an adjacent lifecycle.
    /// </summary>
    [JsonProperty("versionCreatedAtEpochMs")]
    public long VersionCreatedAtEpochMs { get; set; }

    /// <summary>
    /// Unix epoch milliseconds (UTC) of the dataset's creation for THIS lifecycle — the lifecycle
    /// key. Because the Cosmos datasetId/sdPath are deterministic (a hash of
    /// tenant/subproject/path/name with no UUID or timestamp), a delete + recreate of the same name
    /// reuses the same id, so one sdPath partition can interleave multiple "lives." Every archived
    /// version of a single life carries the same datasetCreatedAtEpochMs, so scoping a restore query
    /// to one value isolates that lifecycle and makes previous lives (and the gaps between them)
    /// unreachable. Parsed from the document's created_date.
    /// </summary>
    [JsonProperty("datasetCreatedAtEpochMs")]
    public long DatasetCreatedAtEpochMs { get; set; }

    /// <summary>
    /// The original dataset document captured at archive time.
    /// </summary>
    [JsonProperty("document")]
    public JObject Document { get; set; } = new JObject();

    /// <summary>
    /// Cosmos time-to-live in seconds for this snapshot, bounding the restore retention window.
    /// Null leaves the item without an explicit TTL (never auto-expired).
    /// </summary>
    [JsonProperty("ttl", NullValueHandling = NullValueHandling.Ignore)]
    public int? Ttl { get; set; }
}
