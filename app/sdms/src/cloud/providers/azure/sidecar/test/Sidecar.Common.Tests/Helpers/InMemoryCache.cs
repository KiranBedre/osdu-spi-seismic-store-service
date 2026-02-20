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

namespace Sidecar.Common.Tests;

using System.Text.RegularExpressions;

internal static partial class TestingHelpers
{
    private static readonly Regex _keyPrefixMatcher = new("(.*?):(.*?):");
    private partial class InMemoryCache
    {
        private readonly Dictionary<string, RedisValue> _cache = new();
        private readonly Dictionary<string, List<RedisValue>> _queueCache = new();

        private static string GetHashKey(RedisKey key, RedisValue field) => $"{key}:{field}:";

        public bool KeyExists(string key) => _cache.ContainsKey(key) || _queueCache.ContainsKey(key);

        public Task<bool> KeyExistsAsync(string key) => Task.FromResult(KeyExists(key));

        public long ListRightPush(RedisKey key, string item)
        {
            var list = _queueCache.ContainsKey(key!) ? _queueCache[key!] : new List<RedisValue>();

            var rv = new RedisValue(item);
            list.Add(rv);
            _queueCache[key!] = list;
            return list.Count;
        }

        public async Task<long> ListRightPushAsync(RedisKey key, string item) => await Task.FromResult(ListRightPush(key, item));

        public long ListLeftPush(RedisKey key, string item)
        {
            var list = _queueCache.ContainsKey(key!) ? _queueCache[key!] : new List<RedisValue>();

            var rv = new RedisValue(item);
            list.Insert(0, rv);
            _queueCache[key!] = list;
            return list.Count;
        }

        public async Task<long> ListLeftPushAsync(RedisKey key, string item) => await Task.FromResult(ListLeftPush(key, item));

        public RedisValue[] ListRange(RedisKey key, long start, long stop)
        {
            if (!_queueCache.ContainsKey(key!))
            {
                return Array.Empty<RedisValue>();
            }

            var values = _queueCache[key!];

            if (start < 0)
            {
                start += values.Count;
            }

            if (stop < 0)
            {
                stop += values.Count;
            }

            return values.Skip((int)start).Take((int)(stop - start + 1)).ToArray();
        }

        public RedisValue ListLeftPop(RedisKey key)
        {
            if (!_queueCache.ContainsKey(key!))
            {
                return RedisValue.EmptyString;
            }

            var values = _queueCache[key!];
            if (values.Count <= 0)
            {
                return RedisValue.EmptyString;
            }
            var res = values[0];
            values.RemoveAt(0);
            return res;
        }

        public bool KeyDelete(RedisKey key)
        {
            var keysToDelete = _cache.Keys.Where(e => e.Contains(key!));

            foreach (var k in keysToDelete)
            {
                _ = _cache.Remove(k!);
            }

            return true;
        }

        public async Task<RedisValue[]> ListRangeAsync(RedisKey key, long start, long stop) => await Task.FromResult(ListRange(key, start, stop));

        public async Task<RedisValue> ListLeftPopAsync(RedisKey key) => await Task.FromResult(ListLeftPop(key));

        public async Task<bool> KeyDeleteAsync(RedisKey key) => await Task.FromResult(KeyDelete(key));

        public RedisValue HashGet(RedisKey key, RedisValue field)
        {
            key = GetHashKey(key, field);

            if (_cache.ContainsKey(key!))
            {
                return _cache[key!];
            }
            return RedisValue.EmptyString;

        }

        public async Task<RedisValue> HashGetAsync(RedisKey key, RedisValue field) => await Task.FromResult(HashGet(key, field));

        public bool HashSet(RedisKey key, RedisValue field, RedisValue value)
        {
            key = GetHashKey(key, field);
            if (_cache.ContainsKey(key!))
            {
                _cache[key!] = value;
                return false;
            }
            _cache.Add(key!, value);
            return true;
        }

        public void HashSet(RedisKey key, HashEntry[] hashes)
        {
            foreach (var hash in hashes)
            {
                _ = HashSet(key, new RedisValue(hash!.Name!), new RedisValue(hash!.Value.ToString()));
            }
            return;
        }

        public async Task<bool> HashSetAsync(RedisKey key, RedisValue field, RedisValue value) => await Task.FromResult(HashSet(key, field, value));

        public Task<bool> HashSetAsync(RedisKey key, HashEntry[] hash)
        {
            foreach (var field in hash)
            {
                _ = HashSet(key, field.Name, field.Value);
            }
            return Task.FromResult(true);
        }

        //---since the "cache" is a dictionary with a compound key for each hash entry, when reconstructing
        //---the hash entry form the dictionary, the key prefix needs to be replaced
        //---note the pattern is "<key>:<property name>:" (see the GetHashKey method)
        public HashEntry[] HashGetAll(RedisKey key)
        {
            var hashPrefix = $"{key}:";
            return _cache
                .Where(e => e.Key.StartsWith(hashPrefix))
                .Select(e => new HashEntry(e.Key[hashPrefix.Length..].TrimEnd(':'), e.Value)).ToArray();
        }

        public async Task<HashEntry[]> HashGetAllAsync(RedisKey key) => await Task.FromResult(HashGetAll(key));

        public long HashDecrement(RedisKey key, RedisValue field, long? decrement)
        {
            var initVal = long.Parse(HashGet(key, field)!.ToString()!);
            initVal -= decrement.GetValueOrDefault(1);
            _ = HashSet(key, field, initVal);
            return initVal;
        }

        public long HashIncrement(RedisKey key, RedisValue field, long? increment)
        {
            var initVal = long.Parse(HashGet(key, field)!.ToString()!);
            initVal += increment.GetValueOrDefault(1);
            _ = HashSet(key, field, initVal);
            return initVal;
        }
    }

}
