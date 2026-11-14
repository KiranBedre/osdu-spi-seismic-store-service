// ============================================================================
// Copyright 2017-2025, Schlumberger
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

public class StorageTiersTests
{
    [Fact]
    public void GetSupportedTiers_WithoutSmart_ReturnsBaseTiersOnly()
    {
        var tiers = StorageTiers.GetSupportedTiers(enableSmartTier: false);

        Assert.Equal(3, tiers.Count);
        Assert.Contains("Hot", tiers);
        Assert.Contains("Cool", tiers);
        Assert.Contains("Cold", tiers);
        Assert.DoesNotContain("Smart", tiers);
    }

    [Fact]
    public void GetSupportedTiers_WithSmart_IncludesSmartTier()
    {
        var tiers = StorageTiers.GetSupportedTiers(enableSmartTier: true);

        Assert.Equal(4, tiers.Count);
        Assert.Contains("Smart", tiers);
    }

    [Theory]
    [InlineData("smart", false, false)]
    [InlineData("Smart", true, true)]
    [InlineData("hot", false, true)]
    public void IsSupported_RespectsSmartTierFlag(string tier, bool enableSmartTier, bool expected)
    {
        Assert.Equal(expected, StorageTiers.IsSupported(tier, enableSmartTier));
    }
}
