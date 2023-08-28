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

using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;

namespace Sidecar.Common.Service
{
    using Azure.Core;
    using Azure.Security.KeyVault.Secrets;
    using System.Collections.Concurrent;

    public class CachingBlobClientFactory : IBlobClientFactory
    {
        private readonly IBlobClientFactory _factory;
        private readonly ConcurrentDictionary<string, IBlobClient> _cache = new();

        public CachingBlobClientFactory(IBlobClientFactory factory)
        {
            _factory = factory;
        }

        public async Task<IBlobClient> GetBlobClient(string dataPartitionId, CancellationToken ct = default)
        {
            if (_cache.TryGetValue(dataPartitionId, out var value))
            {
                return value;
            }

            // If this method is called concurrently, it's possible that multiple client instances will be created
            // during the lifetime of this caching factory.
            // This is OK for our application, we don't need "exactly-once caching".
            var client = await _factory.GetBlobClient(dataPartitionId, ct);

            _cache.TryAdd(dataPartitionId, client);

            return client;
        }
    }
}
