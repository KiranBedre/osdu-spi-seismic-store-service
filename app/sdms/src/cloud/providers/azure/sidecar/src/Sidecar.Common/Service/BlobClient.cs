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

namespace Sidecar.Common.Service;

using Azure.Storage.Blobs;
using Sidecar.Common.Interface;
using Azure.Storage.Blobs.Specialized;

/// <summary>
/// Mockable alternative to the raw BlobServiceClient
/// </summary>
public class BlobClient : IBlobClient
{
    private readonly BlobServiceClient _client;

    public BlobClient(BlobServiceClient client)
    {
        _client = client;
    }

    public BlobContainerClient GetContainerClient(string containerName) => _client.GetBlobContainerClient(containerName);

    public BlobBatchClient GetBatchClient() =>
        // Calls to "new" aren't mockable.
        // This is the reason to have this class: to hide the allocation in this method
        // and mock this method instead.
        // note: there's extension method BlobServiceClient.GetBlobBatchClient(), but it's not
        // mockable either.
        new(_client);
}
