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

/// <summary>
/// Storage location and expected content summary for a dataset, resolved from Cosmos metadata.
/// </summary>
/// <remarks>
/// The dataset document does not persist an explicit per-blob path list; it carries a
/// <c>filemetadata</c> object describing the dataset content. <see cref="ExpectedObjectCount"/>
/// (from <c>filemetadata.nobjects</c>) and <see cref="ExpectedTotalSize"/> (from
/// <c>filemetadata.size</c>) are used to validate consistency after a restore by comparing against
/// the blobs actually present under the container/virtual-folder prefix. Both are nullable because
/// <c>filemetadata.nobjects</c>/<c>filemetadata.size</c> may be absent (or non-numeric) on a given
/// dataset version: a <c>null</c> means "not recorded, cannot validate this figure" and is distinct
/// from a recorded value of <c>0</c> (an empty dataset, which the post-restore range must match
/// exactly). Consistency validation skips (and logs) any figure that is <c>null</c>.
/// </remarks>
public sealed record DatasetStorageInfo(
    string GcsUrl,
    string ContainerName,
    string? VirtualFolder,
    long? ExpectedObjectCount,
    long? ExpectedTotalSize,
    string AccessPolicy = "",
    bool IsDeleted = false);
