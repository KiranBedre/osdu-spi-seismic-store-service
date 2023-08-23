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
internal static partial class TestingHelpers
{
    private class InMemoryCache
    {
        private Dictionary<string, RedisValue> Cache = new Dictionary<string, RedisValue>();

        private string GetKey(RedisKey key, RedisValue field)
        {
            return $"{key.ToString()}:{field.ToString()}:";
        }

        public RedisValue HashGet(RedisKey key, RedisValue field)
        {
            key = GetKey(key, field);

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
            key = GetKey(key, field);
            if (Cache.ContainsKey(key!))
            {
                Cache[key!] = value;
                return false;
            }
            Cache.Add(key!, value);
            return true;
        }

        public long HashDecrement(RedisKey key, RedisValue field, long? decrement){
            var initVal = long.Parse(HashGet(key, field)!.ToString()!);
            initVal -= (long)decrement.GetValueOrDefault(1);
            HashSet(key, field, initVal);
            return initVal;
        }

        public long HashIncrement(RedisKey key, RedisValue field, long? increment){
            var initVal = long.Parse(HashGet(key, field)!.ToString()!);
            initVal += (long)increment.GetValueOrDefault(1);
            HashSet(key, field, initVal);
            return initVal;
        }

        public async Task<bool> HashSetAsync(RedisKey key, RedisValue field, RedisValue value)
        {
            return await Task.FromResult(HashSet(key, field, value));
        }
    }

}
