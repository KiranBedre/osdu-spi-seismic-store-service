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
/// Table-driven coverage for <see cref="SdPathParser.Parse"/>, the shared sdPath tokenizer used by
/// the restore metadata reader and writer. Verifies tenant/subproject/dataset extraction, path
/// normalization (leading+trailing slash, "/" when empty), and validation errors for malformed
/// input so both call sites stay in lock-step.
/// </summary>
public class SdPathParserTests
{
    [Theory]
    [InlineData("sd://tenant/subproj/dataset", "tenant", "subproj", "/", "dataset")]
    [InlineData("sd://tenant/subproj/a/dataset", "tenant", "subproj", "/a/", "dataset")]
    [InlineData("sd://tenant/subproj/a/b/dataset", "tenant", "subproj", "/a/b/", "dataset")]
    [InlineData("SD://tenant/subproj/dataset", "tenant", "subproj", "/", "dataset")]
    [InlineData("sd://tenant/subproj/a/b/c/dataset/", "tenant", "subproj", "/a/b/c/", "dataset")]
    public void Parse_ValidSdPath_ReturnsExpectedComponents(
        string sdPath, string tenant, string subproject, string path, string dataset)
    {
        var parts = SdPathParser.Parse(sdPath);

        _ = parts.Tenant.Should().Be(tenant);
        _ = parts.Subproject.Should().Be(subproject);
        _ = parts.Path.Should().Be(path);
        _ = parts.Dataset.Should().Be(dataset);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("tenant/subproj/dataset")]
    [InlineData("https://tenant/subproj/dataset")]
    [InlineData("sd://tenant/subproj")]
    [InlineData("sd://tenant")]
    [InlineData("sd://")]
    public void Parse_InvalidSdPath_ThrowsArgumentException(string? sdPath)
    {
        var act = () => SdPathParser.Parse(sdPath!);

        _ = act.Should().Throw<ArgumentException>().WithParameterName("sdPath");
    }
}
