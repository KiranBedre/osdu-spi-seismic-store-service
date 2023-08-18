namespace Sidecar.Common.Utilitiy
{
    using System.Text.Json;

    using StackExchange.Redis;

    public static class RedisConverters
    {

        public static HashEntry[] ToHashEntries(this object obj)
        {
            var properties = obj.GetType().GetProperties();
            return properties
                .Where(x => x.GetValue(obj) != null)
                .Select(property =>
                {
                    object propertyValue = property.GetValue(obj)!;
                    string hashValue;

                    if (propertyValue is IEnumerable<object>)
                    {
                        hashValue = JsonSerializer.Serialize(propertyValue);
                    }
                    else
                    {
                        hashValue = propertyValue.ToString()!;
                    }

                    return new HashEntry(property.Name, hashValue);
                })
                .ToArray();
        }
    }
}