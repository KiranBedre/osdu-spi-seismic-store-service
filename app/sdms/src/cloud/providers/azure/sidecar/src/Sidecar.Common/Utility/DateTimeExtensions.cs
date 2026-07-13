// ============================================================================
// Copyright 2017-2024, Microsoft
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

using System.Globalization;

/// <summary>
/// Extension methods for DateTime to match JavaScript date formatting.
/// </summary>
public static class DateTimeExtensions
{
    /// <summary>
    /// ISO 8601 format string matching JavaScript's toISOString() output.
    /// Example: "2026-01-23T10:30:00.000Z"
    /// </summary>
    private const string IsoFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";

    /// <summary>
    /// JavaScript Date.toString() format, e.g.
    /// "Wed Jul 08 2026 10:07:15 GMT+0000 (Coordinated Universal Time)".
    /// </summary>
    private const string JsToStringFormat = "ddd MMM dd yyyy HH:mm:ss 'GMT'zzz";

    /// <summary>
    /// Converts a DateTime to ISO 8601 string format matching JavaScript's toISOString().
    /// </summary>
    /// <param name="dateTime">The DateTime to convert (should be UTC).</param>
    /// <returns>ISO 8601 formatted string like "2026-01-23T10:30:00.000Z"</returns>
    public static string ToISOString(this DateTime dateTime) => dateTime.ToString(IsoFormat);

    /// <summary>
    /// Gets the current UTC time as an ISO 8601 string matching JavaScript's toISOString().
    /// </summary>
    /// <returns>ISO 8601 formatted string like "2026-01-23T10:30:00.000Z"</returns>
    public static string UtcNowISOString() => DateTime.UtcNow.ToString(IsoFormat);

    /// <summary>
    /// Parses a dataset timestamp to epoch milliseconds. Dataset dates are written by the
    /// Node.js service via JavaScript Date.toString(), e.g.
    /// "Wed Jul 08 2026 10:07:15 GMT+0000 (Coordinated Universal Time)", which
    /// DateTimeOffset.TryParse cannot handle. Strips the trailing timezone name and parses
    /// the JS format explicitly, falling back to a general parse for ISO-8601 values.
    /// Returns 0 when the value is null/blank or cannot be parsed.
    /// </summary>
    public static long ParseJsDateToEpochMs(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return 0;
        }

        // Strip trailing " (Coordinated Universal Time)" style timezone name
        var parenIndex = value.IndexOf(" (", StringComparison.Ordinal);
        var normalized = parenIndex > 0 ? value[..parenIndex] : value;

        if (DateTimeOffset.TryParseExact(
                normalized,
                JsToStringFormat,
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var jsDate))
        {
            return jsDate.ToUnixTimeMilliseconds();
        }

        // Fallback: ISO-8601 or other culture-invariant formats
        return DateTimeOffset.TryParse(
                   normalized,
                   CultureInfo.InvariantCulture,
                   DateTimeStyles.AssumeUniversal,
                   out var iso)
            ? iso.ToUnixTimeMilliseconds()
            : 0;
    }
}
