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

using Sidecar.Common;
using Sidecar.Common.Utility;

/// <summary>
/// Table-driven coverage for <see cref="AzureBlobRestoreStatusParser"/>, the single place the raw
/// Azure Storage management-plane <c>blobRestoreStatus.status</c> literals are mapped onto the
/// <see cref="AzureBlobRestoreStatus"/> enum. Verifies case-insensitive parsing, that both
/// "Complete" and "Succeeded" denote terminal success, and the InProgress/Complete adoption gate.
/// </summary>
public class AzureBlobRestoreStatusParserTests
{
    [Theory]
    [InlineData("InProgress", AzureBlobRestoreStatus.InProgress)]
    [InlineData("inprogress", AzureBlobRestoreStatus.InProgress)]
    [InlineData("Complete", AzureBlobRestoreStatus.Complete)]
    [InlineData("Succeeded", AzureBlobRestoreStatus.Complete)]
    [InlineData("SUCCEEDED", AzureBlobRestoreStatus.Complete)]
    [InlineData("Failed", AzureBlobRestoreStatus.Failed)]
    [InlineData("failed", AzureBlobRestoreStatus.Failed)]
    public void Parse_KnownStatus_ReturnsExpectedEnum(string status, AzureBlobRestoreStatus expected)
    {
        _ = AzureBlobRestoreStatusParser.Parse(status).Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Pending")]
    [InlineData("Cancelled")]
    public void Parse_UnknownOrEmptyStatus_ReturnsUnknown(string? status)
    {
        _ = AzureBlobRestoreStatusParser.Parse(status).Should().Be(AzureBlobRestoreStatus.Unknown);
    }

    [Theory]
    [InlineData(AzureBlobRestoreStatus.InProgress, true)]
    [InlineData(AzureBlobRestoreStatus.Complete, true)]
    [InlineData(AzureBlobRestoreStatus.Failed, false)]
    [InlineData(AzureBlobRestoreStatus.Unknown, false)]
    public void IsActiveOrCompleted_ReturnsExpected(AzureBlobRestoreStatus status, bool expected)
    {
        _ = status.IsActiveOrCompleted().Should().Be(expected);
    }
}
