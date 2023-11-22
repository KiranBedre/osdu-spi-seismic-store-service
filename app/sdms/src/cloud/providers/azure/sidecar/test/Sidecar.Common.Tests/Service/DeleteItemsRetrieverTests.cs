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

namespace Sidecar.Common.Tests.Service;

public class DeleteItemsRetrieverTests
{
    [Fact]
    public async Task GetItems_WithValidData_ReturnsListOfDeleteItems()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<DeleteItemsRetriever>>();
        var dataAccessMock = new Mock<IDataAccess>();
        var cosmosFactoryMock = new Mock<ICosmosClientFactory>();

        var deleteItemsRetriever = new DeleteItemsRetriever(dataAccessMock.Object, cosmosFactoryMock.Object);

        var tenant = "myTenant";
        var subproject = "subproj";
        var query = "SELECT c.id, c.data.gcsurl, c.data.name from c WHERE subproject = \""
            + subproject + "\" AND path = \"path\"";
        var parameters = "[]";
        var records = new List<object>
        {
            /*lang=json,strict*/
            @"{ ""id"": ""1"", ""gcsurl"": ""url1"", ""path"": ""path1"", ""name"": ""name1"" }",
            /*lang=json,strict*/
            @"{ ""id"": ""2"", ""gcsurl"": ""url2"", ""path"": ""path2"", ""name"": ""name2"" }",
        };
        var paginatedRecords = new PaginatedRecords { records = records };

        _ = dataAccessMock.Setup(d => d.GetRecordsAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), null, null))
            .ReturnsAsync(paginatedRecords);

        // Act
        var result = await deleteItemsRetriever.GetItemsAsync(tenant, query, parameters);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(2, result.Count);
        Assert.Equal("url1", result[0].Gcsurl);
        Assert.Equal("url2", result[1].Gcsurl);
    }
}
