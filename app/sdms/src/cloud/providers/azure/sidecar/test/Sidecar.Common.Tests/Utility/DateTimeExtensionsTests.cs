// ============================================================================
// Copyright 2026, Microsoft
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

namespace Sidecar.Common.Tests.Utility;

using Sidecar.Common.Utility;

/// <summary>
/// Coverage for <see cref="DateTimeExtensions.TryParseFlexibleUtc"/>, the load-bearing parser that
/// converts dataset <c>created_date</c> / <c>last_modified_date</c> into the epoch-millisecond
/// window bounds (versionCreatedAt / archivedAt / datasetCreatedAtEpochMs) used by point-in-time
/// restore selection. SDMS persists these fields via the web API's <c>new Date().toString()</c>,
/// a non-ISO JavaScript form that the standard parsers cannot read directly, so both shapes must
/// round-trip to the same UTC instant.
/// </summary>
public class DateTimeExtensionsTests
{
    [Theory]
    // JavaScript Date.toString() with a positive offset (IST) -> 05:30 UTC.
    [InlineData("Fri Jul 03 2026 11:00:00 GMT+0530 (India Standard Time)", "2026-07-03T05:30:00Z")]
    // Single-digit day of month (JS pads to two, but tolerate both formats).
    [InlineData("Wed Jul 01 2026 00:00:00 GMT+0000 (Coordinated Universal Time)", "2026-07-01T00:00:00Z")]
    // Negative offset (US Pacific Daylight) -> +7h UTC.
    [InlineData("Fri Jul 03 2026 04:00:00 GMT-0700 (Pacific Daylight Time)", "2026-07-03T11:00:00Z")]
    // ISO-8601 (JavaScript toISOString) with milliseconds.
    [InlineData("2026-07-03T05:30:00.000Z", "2026-07-03T05:30:00Z")]
    // ISO-8601 with an explicit offset -> normalized to UTC.
    [InlineData("2026-07-03T11:00:00+05:30", "2026-07-03T05:30:00Z")]
    public void TryParseFlexibleUtc_ParsesIsoAndJsForms_ToUtc(string input, string expectedIso)
    {
        var parsed = DateTimeExtensions.TryParseFlexibleUtc(input, out var utc);

        _ = parsed.Should().BeTrue();
        _ = utc.ToUnixTimeMilliseconds()
            .Should().Be(DateTimeOffset.Parse(expectedIso).ToUnixTimeMilliseconds());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-date")]
    public void TryParseFlexibleUtc_ReturnsFalse_ForMissingOrUnparseable(string? input)
    {
        var parsed = DateTimeExtensions.TryParseFlexibleUtc(input, out var utc);

        _ = parsed.Should().BeFalse();
        _ = utc.Should().Be(default);
    }

    [Fact]
    public void TryParseFlexibleUtc_IsoAndEquivalentJsForm_ProduceSameEpochMs()
    {
        // The same instant expressed as JS Date.toString() (IST) and ISO-8601 (UTC) must map to an
        // identical epoch-ms value, since restore compares these numbers directly across fields
        // written from either representation.
        _ = DateTimeExtensions.TryParseFlexibleUtc(
            "Fri Jul 03 2026 11:00:00 GMT+0530 (India Standard Time)", out var fromJs).Should().BeTrue();
        _ = DateTimeExtensions.TryParseFlexibleUtc("2026-07-03T05:30:00.000Z", out var fromIso).Should().BeTrue();

        _ = fromJs.ToUnixTimeMilliseconds().Should().Be(fromIso.ToUnixTimeMilliseconds());
    }
}
