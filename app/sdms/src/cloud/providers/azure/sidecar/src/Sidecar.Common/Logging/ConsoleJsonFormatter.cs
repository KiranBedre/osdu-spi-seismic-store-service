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

namespace Sidecar.Common.Logging;

using System.Text.Json;
using System.Text.RegularExpressions;
using Serilog.Events;
using Serilog.Formatting;

public partial class ConsoleJsonFormatter : ITextFormatter
{
    private static readonly JsonWriterOptions JsonOptions = new()
    {
        Indented = false
    };

    [GeneratedRegex(@"bearer\s+[a-zA-Z0-9\-_\.]+", RegexOptions.IgnoreCase)]
    private static partial Regex BearerTokenRegex();

    [GeneratedRegex(@"""authorization""\s*:\s*""[^""]+""", RegexOptions.IgnoreCase)]
    private static partial Regex AuthorizationHeaderRegex();

    private static string RedactSensitiveData(string message)
    {
        if (string.IsNullOrEmpty(message))
        {
            return message;
        }

        message = BearerTokenRegex().Replace(message, "******");
        return AuthorizationHeaderRegex().Replace(
            message,
            "\"authorization\": \"[REDACTED]\"");
    }

    public void Format(LogEvent logEvent, TextWriter output)
    {
        using var stream = new MemoryStream();
        using var writer = new Utf8JsonWriter(stream, JsonOptions);

        writer.WriteStartObject();
        writer.WriteString(
            "time",
            logEvent.Timestamp.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));

        var logLevel = GetLogLevelString(logEvent.Level);
        writer.WriteString("level", logLevel);
        writer.WriteString("logLevel", logLevel);

        var message = RedactSensitiveData(logEvent.RenderMessage());
        writer.WriteString("message", message);
        writer.WriteString("log", message);

        foreach (var property in logEvent.Properties)
        {
            WriteProperty(writer, property.Key, property.Value);
        }

        if (logEvent.Exception != null)
        {
            writer.WriteString("exception", logEvent.Exception.ToString());
        }

        writer.WriteEndObject();
        writer.Flush();
        output.WriteLine(System.Text.Encoding.UTF8.GetString(stream.ToArray()));
    }

    private static string GetLogLevelString(LogEventLevel level) => level switch
    {
        LogEventLevel.Verbose => "Trace",
        LogEventLevel.Debug => "Debug",
        LogEventLevel.Information => "Information",
        LogEventLevel.Warning => "Warning",
        LogEventLevel.Error => "Error",
        LogEventLevel.Fatal => "Critical",
        _ => level.ToString()
    };

    private static void WriteProperty(
        Utf8JsonWriter writer,
        string name,
        LogEventPropertyValue value)
    {
        switch (value)
        {
            case ScalarValue scalar:
                WriteScalarValue(writer, name, scalar);
                break;
            case SequenceValue sequence:
                writer.WriteStartArray(name);
                foreach (var element in sequence.Elements)
                {
                    WritePropertyValue(writer, element);
                }
                writer.WriteEndArray();
                break;
            case StructureValue structure:
                writer.WriteStartObject(name);
                foreach (var property in structure.Properties)
                {
                    WriteProperty(writer, property.Name, property.Value);
                }
                writer.WriteEndObject();
                break;
            case DictionaryValue dictionary:
                writer.WriteStartObject(name);
                foreach (var pair in dictionary.Elements)
                {
                    var key = pair.Key.Value?.ToString() ?? "null";
                    WriteProperty(writer, key, pair.Value);
                }
                writer.WriteEndObject();
                break;
        }
    }

    private static void WriteScalarValue(
        Utf8JsonWriter writer,
        string name,
        ScalarValue scalar)
    {
        switch (scalar.Value)
        {
            case null:
                writer.WriteNull(name);
                break;
            case bool value:
                writer.WriteBoolean(name, value);
                break;
            case int value:
                writer.WriteNumber(name, value);
                break;
            case long value:
                writer.WriteNumber(name, value);
                break;
            case double value:
                writer.WriteNumber(name, value);
                break;
            case decimal value:
                writer.WriteNumber(name, value);
                break;
            case DateTime value:
                writer.WriteString(name, value.ToString("O"));
                break;
            case DateTimeOffset value:
                writer.WriteString(name, value.ToString("O"));
                break;
            default:
                writer.WriteString(name, scalar.Value.ToString());
                break;
        }
    }

    private static void WritePropertyValue(
        Utf8JsonWriter writer,
        LogEventPropertyValue value)
    {
        switch (value)
        {
            case ScalarValue scalar:
                WriteScalarValueRaw(writer, scalar);
                break;
            case SequenceValue sequence:
                writer.WriteStartArray();
                foreach (var element in sequence.Elements)
                {
                    WritePropertyValue(writer, element);
                }
                writer.WriteEndArray();
                break;
            case StructureValue structure:
                writer.WriteStartObject();
                foreach (var property in structure.Properties)
                {
                    WriteProperty(writer, property.Name, property.Value);
                }
                writer.WriteEndObject();
                break;
            case DictionaryValue dictionary:
                writer.WriteStartObject();
                foreach (var pair in dictionary.Elements)
                {
                    var key = pair.Key.Value?.ToString() ?? "null";
                    WriteProperty(writer, key, pair.Value);
                }
                writer.WriteEndObject();
                break;
        }
    }

    private static void WriteScalarValueRaw(
        Utf8JsonWriter writer,
        ScalarValue scalar)
    {
        switch (scalar.Value)
        {
            case null:
                writer.WriteNullValue();
                break;
            case bool value:
                writer.WriteBooleanValue(value);
                break;
            case int value:
                writer.WriteNumberValue(value);
                break;
            case long value:
                writer.WriteNumberValue(value);
                break;
            case double value:
                writer.WriteNumberValue(value);
                break;
            case decimal value:
                writer.WriteNumberValue(value);
                break;
            case DateTime value:
                writer.WriteStringValue(value.ToString("O"));
                break;
            case DateTimeOffset value:
                writer.WriteStringValue(value.ToString("O"));
                break;
            default:
                writer.WriteStringValue(scalar.Value.ToString());
                break;
        }
    }
}
