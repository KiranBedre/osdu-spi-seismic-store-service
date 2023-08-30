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
using Microsoft.Azure.Cosmos;

namespace Sidecar.Common.Tests.Service
{
    public class MetadataDeletionWorkerTests
    {
        [Fact]
        public async Task DeleteMetadata_SuccessfulDeletion()
        {
            // Arrange
            var dataAccessMock = new Mock<IDataAccess>();
            dataAccessMock.Setup(d => d.DeleteMetadata(It.IsAny<string>(), It.IsAny<string>())).ReturnsAsync(true);

            var tenant = "tenant";
            var cs = "booboo";

            var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
            cosmosClientFactoryMock.Setup(o => o.GetCosmosConnectionString(tenant, It.IsAny<CancellationToken>())).ReturnsAsync(cs);

            var deletionWorker = new MetadataDeletionWorker(dataAccessMock.Object, cosmosClientFactoryMock.Object);

            // Act
            await deletionWorker.DeleteMetadata(tenant, "metadataId");

            // Assert
            dataAccessMock.Verify(d => d.DeleteMetadata(cs, "metadataId"), Times.Once);
        }

        [Fact]
        public async Task DeleteMetadata_FailureThenSuccess()
        {
            // Arrange
            var dataAccessMock = new Mock<IDataAccess>();
            dataAccessMock.SetupSequence(d => d.DeleteMetadata(It.IsAny<string>(), It.IsAny<string>()))
                .ThrowsAsync(new CosmosException("Error", System.Net.HttpStatusCode.NotFound, 0, "123", 0))
                .ReturnsAsync(true);

            var tenant = "tenant";
            var cs = "booboo";

            var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
            cosmosClientFactoryMock.Setup(o => o.GetCosmosConnectionString(tenant, It.IsAny<CancellationToken>())).ReturnsAsync(cs);

            var deletionWorker = new MetadataDeletionWorker(dataAccessMock.Object, cosmosClientFactoryMock.Object);

            // Act
            await deletionWorker.DeleteMetadata(tenant, "metadataId");

            // Assert
            dataAccessMock.Verify(d => d.DeleteMetadata(cs, "metadataId"), Times.Exactly(2));
        }
    }
}
