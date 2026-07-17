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
using System.Text.RegularExpressions;

/// <summary>
/// Extension methods for DateTime to match JavaScript date formatting.
/// </summary>
public static partial class DateTimeExtensions
{
    /// <summary>
    /// ISO 8601 format string matching JavaScript's toISOString() output.
    /// Example: "2026-01-23T10:30:00.000Z"
    /// </summary>
    private const string IsoFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";

    /// <summary>
    /// Exact formats for JavaScript's Date.toString() output once the trailing
    /// "(Time Zone Name)" is stripped, the literal "GMT" removed, and the numeric
    /// offset colon-normalized (e.g. "+0530" -> "+05:30").
    /// Example source: "Fri Jul 03 2026 11:00:00 GMT+0530 (India Standard Time)".
    /// </summary>
    private static readonly string[] JsDateFormats =
    {
        "ddd MMM d yyyy HH:mm:ss zzz",
        "ddd MMM dd yyyy HH:mm:ss zzz",
    };

    private static readonly DateTimeStyles UtcStyles =
        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal;

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
    /// Attempts to parse a timestamp string into a UTC <see cref="DateTimeOffset"/>, tolerating
    /// both ISO-8601 (JavaScript toISOString / Date API) and JavaScript's non-standard
    /// Date.toString() output (e.g. "Fri Jul 03 2026 11:00:00 GMT+0530 (India Standard Time)").
    /// SDMS dataset metadata persists <c>created_date</c> / <c>last_modified_date</c> using
    /// <c>new Date().toString()</c>, which the standard parsers cannot read directly.
    /// </summary>
    /// <param name="value">The timestamp string to parse.</param>
    /// <param name="utc">On success, the parsed instant normalized to UTC.</param>
    /// <returns><c>true</c> if the value was parsed; otherwise <c>false</c>.</returns>
    public static bool TryParseFlexibleUtc(string? value, out DateTimeOffset utc)
    {
        utc = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        // 1) ISO-8601 and other standard formats: handled entirely by the BCL parser.
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, UtcStyles, out utc))
        {
            return true;
        }

        // 2) JavaScript Date.toString() form, e.g.
        //    "Fri Jul 03 2026 11:00:00 GMT+0530 (India Standard Time)".
        // No BCL/library API (DateTimeOffset.TryParse[Exact], NodaTime, etc.) parses this shape
        // directly: the trailing "(Zone Name)" is free-form text that no format specifier can
        // consume, and the colon-less "GMT+0530" offset is not accepted by the 'zzz'/'K' specifiers
        // (which require "+05:30"). We therefore normalize just those two deviations, then hand the
        // result back to the BCL's exact parser rather than computing the instant ourselves.
        var normalized = TrailingZoneNameRegex().Replace(value, string.Empty); // drop trailing "(...)"
        normalized = normalized.Replace("GMT", string.Empty);                  // drop literal GMT
        normalized = ColonlessOffsetRegex().Replace(normalized, "$1:$2");      // "+0530" -> "+05:30"
        normalized = WhitespaceRegex().Replace(normalized, " ").Trim();        // collapse whitespace

        return DateTimeOffset.TryParseExact(
            normalized, JsDateFormats, CultureInfo.InvariantCulture, UtcStyles, out utc);
    }

    /// <summary>
    /// Parses a JavaScript-style date string into Unix epoch milliseconds (UTC), returning 0 when
    /// the value is missing or unparseable. Accepts the same formats as <see cref="TryParseFlexibleUtc"/>.
    /// </summary>
    /// <param name="value">The timestamp string to parse.</param>
    /// <returns>Unix epoch milliseconds, or 0 if the value cannot be parsed.</returns>
    public static long ParseJsDateToEpochMs(string? value) =>
        TryParseFlexibleUtc(value, out var utc) ? utc.ToUnixTimeMilliseconds() : 0L;

    // Source-generated (compile-time) regexes for the three fixed deviations of JS Date.toString()
    // from an exact-parseable form. Using [GeneratedRegex] avoids per-call runtime pattern
    // compilation and keeps the patterns declarative.

    /// <summary>Matches the trailing " (Time Zone Name)" segment.</summary>
    [GeneratedRegex(@"\s*\([^)]*\)\s*$")]
    private static partial Regex TrailingZoneNameRegex();

    /// <summary>Matches a colon-less numeric offset (e.g. "+0530") for colon insertion.</summary>
    [GeneratedRegex(@"([+\-]\d{2})(\d{2})")]
    private static partial Regex ColonlessOffsetRegex();

    /// <summary>Matches runs of whitespace for collapsing to a single space.</summary>
    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
