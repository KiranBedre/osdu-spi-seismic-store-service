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

using Sidecar.Common.Interface;
using StackExchange.Redis;
using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

public static class RedisConverters
{
    public static HashEntry[] ToHashEntries(this ISupportsRedisHashEntry obj, bool useJsonPropertyNames = false)
    {
        var properties = obj.GetType().GetProperties();
        return properties
            .Where(x => x.GetValue(obj) != null)
            .Select(p =>
            {
                var propertyValue = p.GetValue(obj)!;
                var hashValue = propertyValue switch
                {
                    IEnumerable<object> => JsonSerializer.Serialize(propertyValue),
                    DateTime time => time.ToString("O", DateTimeFormatInfo.InvariantInfo),  // ISO-8601
                    _ => propertyValue.ToString(),
                };
                var jpa = p.GetCustomAttribute<JsonPropertyNameAttribute>();
                var propName = (useJsonPropertyNames && jpa is not null && !string.IsNullOrEmpty(jpa.Name)) ? jpa.Name : p.Name;
                return new HashEntry(propName, hashValue);
            })
            .ToArray();
    }

    public static T FromHashEntries<T>(this HashEntry[] hashEntries, bool useJsonPropertyNames = false) where T : ISupportsRedisHashEntry
    {
        var obj = Activator.CreateInstance(typeof(T));
        foreach (var p in typeof(T).GetProperties())
        {
            var jpa = p.GetCustomAttribute<JsonPropertyNameAttribute>();
            var propName = (useJsonPropertyNames && jpa is not null && !string.IsNullOrEmpty(jpa.Name)) ? jpa.Name : p.Name;

            var entry = hashEntries.FirstOrDefault(he => he.Name.ToString().Equals(propName));
            if (entry.Equals(new HashEntry()))
            {
                continue;
            }

            p.SetValue(obj, Convert.ChangeType(entry.Value.ToString(), p.PropertyType));
        }
        return (T)obj!;
    }
}
