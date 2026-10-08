// ============================================================================
// Copyright 2017-2023, Microsoft
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

using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;

public interface IBlobClient
{
    Uri Uri { get; }
    BlobContainerClient GetContainerClient(string containerName);
    BlobBatchClient GetBatchClient();

    /// <summary>
    /// Returns true if the (live) container currently exists on the account.
    /// </summary>
    Task<bool> ContainerExistsAsync(string containerName, CancellationToken ct = default);

    /// <summary>
    /// Attempts to restore a soft-deleted container by exact name. Returns true if a matching
    /// soft-deleted container was found and undeleted; false if no soft-deleted container with
    /// that name exists (e.g. outside the retention window or never deleted).
    /// </summary>
    Task<bool> TryUndeleteContainerAsync(string containerName, CancellationToken ct = default);
}
