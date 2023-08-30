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

namespace Sidecar.Common.Utility;

using System.Collections.Concurrent;

public class AsyncCache<TK, T> where TK : notnull
{
    private readonly ConcurrentDictionary<TK, T> _cache = new();

    /// <summary>
    /// If the key is already cached, returns the value.
    /// If the key is not cached, executes the <see cref="valueFactory"/> function and
    /// caches the value by the key.
    ///
    /// Does not cache if <see cref="valueFactory"/> fails.
    /// 
    /// Does not guarantee <see cref="valueFactory"/> will we executed exactly once per key.
    ///
    /// Guarantees the return value is always the same for the key.
    /// </summary>
    /// <param name="cacheKey">Cache key</param>
    /// <param name="valueFactory">Async function that returns a result</param>
    /// <returns>Result of valueFactory, or the</returns>
    public async Task<T> GetValue(TK cacheKey, Func<Task<T>> valueFactory)
    {
        if (_cache.TryGetValue(cacheKey, out var value))
        {
            return value;
        }

        // If this method is called concurrently, it's possible that valueFactory() will be called
        // multiple times for the same cacheKey.
        // This is OK for our application, we don't need "exactly-once caching".
        var newValue = await valueFactory();

        return _cache.GetOrAdd(cacheKey, newValue);
    }
}
