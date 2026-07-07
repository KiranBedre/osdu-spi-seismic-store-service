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
/// Reads the storage location for a dataset from the metadata store.
/// This keeps storage restore logic independent from Cosmos query details.
/// </summary>
public interface IDatasetStorageInfoProvider
{
    /// <summary>
    /// Resolves the dataset info needed by restore:
    /// storage container, optional folder prefix, and blob paths.
    /// Must support both active (primary) metadata and archived metadata records.
    /// </summary>
    /// <param name="sdPath">Full dataset SD path.</param>
    /// <param name="operationId">Operation ID for correlation and logging.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<DatasetStorageInfo> ResolveDatasetInfoAsync(string sdPath, string operationId, CancellationToken ct);
}
