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
/// Ensures the storage container backing a dataset is present before blob PITR runs.
/// Under the 'dataset' access policy each dataset owns a dedicated container that is deleted
/// together with the dataset; restoring such a dataset therefore requires undeleting the
/// (soft-deleted) container first.
/// </summary>
public interface IContainerRestoreService
{
    /// <summary>
    /// If the dataset uses the 'dataset' access policy and its container is missing, attempts to
    /// undelete the soft-deleted container and waits until it becomes visible. No-op when the
    /// dataset is not deleted, for the 'uniform' access policy (shared container), or when the
    /// container already exists. Returns true when a deleted dataset's dedicated container has
    /// been undeleted, including on redelivery when that container is already visible.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// Thrown when the container is missing and no soft-deleted copy can be restored, or when the
    /// undeleted container does not become visible within the expected window.
    /// </exception>
    Task<bool> EnsureContainerAvailableAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string operationId,
        CancellationToken ct = default);
}
