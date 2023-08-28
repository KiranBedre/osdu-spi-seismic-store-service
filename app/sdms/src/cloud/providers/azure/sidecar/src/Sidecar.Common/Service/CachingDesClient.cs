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

using Interface;
using Sidecar.Common.Model;
using System.Collections.Concurrent;

public class CachingDesClient : IDesClient
{
    private readonly IDesClient _origin;
    private readonly ConcurrentDictionary<string, DesResponse> _cache = new(); 
    
    public CachingDesClient(IDesClient origin)
    {
        _origin = origin;
    }

    public async Task<DesResponse> GetPartitionConfiguration(string dataPartitionId, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(dataPartitionId, out var value))
        {
            return value;
        }

        // If this method is called concurrently, it's possible that _origin.GetPartitionConfiguration() will be called
        // multiple times for the same dataPartitionId.
        // This is OK for our application, we don't need "exactly-once caching".
        var response = await _origin.GetPartitionConfiguration(dataPartitionId, ct);

        _cache.TryAdd(dataPartitionId, response);

        return response;
    }
}
