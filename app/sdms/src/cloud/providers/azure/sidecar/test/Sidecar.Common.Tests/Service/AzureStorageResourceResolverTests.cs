// ============================================================================
// Copyright 2026, Microsoft Corporation
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

namespace Sidecar.Common.Tests.Service;

using Azure.Security.KeyVault.Secrets;

public class AzureStorageResourceResolverTests
{
    [Fact]
    public void ResolveResourceGroupName_ReturnsConfiguredStorageResourceGroup()
    {
        var resourceScope = new Mock<IOptionsAzureResourceScope>();
        _ = resourceScope.SetupGet(o => o.AzureResourceGroup).Returns("rg-sdms-storage");
        var sut = new AzureStorageResourceResolver(
            resourceScope.Object,
            new Mock<IDesClient>().Object,
            new Mock<SecretClient>().Object);

        var result = sut.ResolveResourceGroupName("opendes");

        _ = result.Should().Be("rg-sdms-storage");
    }

    [Fact]
    public void ResolveResourceGroupName_WhenMissing_Throws()
    {
        var resourceScope = new Mock<IOptionsAzureResourceScope>();
        _ = resourceScope.SetupGet(o => o.AzureResourceGroup).Returns(string.Empty);
        var sut = new AzureStorageResourceResolver(
            resourceScope.Object,
            new Mock<IDesClient>().Object,
            new Mock<SecretClient>().Object);

        var act = () => sut.ResolveResourceGroupName("opendes");

        _ = act.Should().Throw<InvalidOperationException>()
            .WithMessage("*AZURE_RESOURCE_GROUP*");
    }
}
