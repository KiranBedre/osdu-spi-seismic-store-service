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

using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sidecar.Common.Tests;
internal static partial class TestingHelpers
{
    private partial class InMemoryCache
    {
        private readonly Dictionary<string, RedisValue>  Cache = new();
        private readonly Dictionary<string, List<RedisValue>> QueueCache = new();

        private static string GetHashKey(RedisKey key, RedisValue field)
        {
            return $"{key}:{field}:";
        }

        public bool KeyExists(string key){
            return Cache.ContainsKey(key) || QueueCache.ContainsKey(key);
        }

        public Task<bool> KeyExistsAsync(string key){
            return Task.FromResult(KeyExists(key));
        }

        public long ListLeftPush(RedisKey key, string item)
        {
            var list = QueueCache.ContainsKey(key!) ? QueueCache[key!] : new List<RedisValue>();

            var rv = new RedisValue(item);
            list.Add(rv);
            QueueCache[key!] = list;
            return list.Count;
        }

        public async Task<long> ListLeftPushAsync(RedisKey key, string item)
        {
            return await Task.FromResult(ListLeftPush(key, item));
        }

        public RedisValue ListLeftPop(RedisKey key)
        {
            if (!QueueCache.ContainsKey(key!))
            {
                return RedisValue.EmptyString;
            }

            var vals = QueueCache[key!];
            if(vals.Count <= 0)
            {
                return RedisValue.EmptyString;
            }
            var res = vals[0];
            vals.RemoveAt(0);
            return res;
        }

        public async Task<RedisValue> ListLeftPopAsync(RedisKey key)
        {
            return await Task.FromResult(ListLeftPop(key));
        }

        public RedisValue HashGet(RedisKey key, RedisValue field)
        {
            key = GetHashKey(key, field);

            if (Cache.ContainsKey(key!))
            {
                return Cache[key!];
            }
            return RedisValue.EmptyString;

        }

        public async Task<RedisValue> HashGetAsync(RedisKey key, RedisValue field)
        {
            return await Task.FromResult(HashGet(key, field));
        }

        public bool HashSet(RedisKey key, RedisValue field, RedisValue value)
        {
            key = GetHashKey(key, field);
            if (Cache.ContainsKey(key!))
            {
                Cache[key!] = value;
                return false;
            }
            Cache.Add(key!, value);
            return true;
        }

        public void HashSet(RedisKey key, HashEntry[] hashes)
        {
            foreach (var hash in hashes)
            {
                HashSet(key, new RedisValue(hash!.Name!), new RedisValue(hash!.Value.ToString()));
            }
            return;
        }

        public async Task<bool> HashSetAsync(RedisKey key, RedisValue field, RedisValue value)
        {
            return await Task.FromResult(HashSet(key, field, value));
        }

        public async Task<bool> HashSetAsync(RedisKey key, HashEntry[] hash)
        {
            foreach (var field in hash)
            {
                _ = await Task.FromResult(HashSet(key, new RedisValue(field!.Name!), new RedisValue(hash!.ToString()!)));
            }
            return true;
        }

        public HashEntry[] HashGetAll(RedisKey key)
        {
            //---since the "cache" is a dictionary with a compound key for each hashentry, when reconstructing
            //---the hash entry form the dictionary, the key prefix needs to be replaced
            //---note the patter is "<queue name>:<key>:<property name>"
            return Cache
                    .Where(e => e.Key.Contains(key!))
                    .Select(e => new HashEntry(KeyPrefixMatcher().Replace(e.Key, "").Replace(":",""), e.Value)).ToArray();

        }

        public async Task<HashEntry[]> HashGetAllAsync(RedisKey key)
        {
            return await Task.FromResult(HashGetAll(key));

        }

        public long HashDecrement(RedisKey key, RedisValue field, long? decrement){
            var initVal = long.Parse(HashGet(key, field)!.ToString()!);
            initVal -= decrement.GetValueOrDefault(1);
            HashSet(key, field, initVal);
            return initVal;
        }

        public long HashIncrement(RedisKey key, RedisValue field, long? increment){
            var initVal = long.Parse(HashGet(key, field)!.ToString()!);
            initVal += increment.GetValueOrDefault(1);
            HashSet(key, field, initVal);
            return initVal;
        }

        [GeneratedRegex("(.*?):(.*?):")]
        private static partial Regex KeyPrefixMatcher();
    }

}
