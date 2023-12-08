namespace Sidecar.ComputeSizeOperationRunner.Tests.Service;

using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Moq;
using Sidecar.Common.Interface;
using Sidecar.ComputeSizeRunner;
using Xunit;

public class MetadataUpdaterTest
{
    [Fact]
    public async Task UpdateMetadataComputeSize_Success()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataUpdater>>();
        var dataAccessMock = new Mock<IDataAccess>();
        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        var dateFormatterMock = new Mock<IDateFormatter>();
        var metadataUpdater = new MetadataUpdater(loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, dateFormatterMock.Object);

        var cs = "secret";
        var dataPartitionId = "dataPartitionId";
        var metadataId = "metadataID";
        var size = 1024L;
        var updateDate = "Tue, 31 Oct 2023 12:12:12 GMT";
        var cancellationToken = new CancellationToken();
        _ = dateFormatterMock.Setup(_ => _.FormatDate(It.IsAny<DateTime>())).Returns(updateDate);
        _ = cosmosClientFactoryMock.Setup(_ => _.GetCosmosConnectionStringAsync(dataPartitionId, cancellationToken)).ReturnsAsync(cs);

        // Act
        await metadataUpdater.UpdateComputeSize(dataPartitionId, metadataId, size, cancellationToken);

        // Assert
        var args = new List<Dictionary<string, object>>();
        dataAccessMock.Verify(_ => _.UpdateMetadataAsync(cs, metadataId, Capture.In(args)), Times.Once);

        _ = Assert.Single(args);
        Assert.True(args[0].ContainsKey("/data/computed_size"));
        Assert.True(args[0].ContainsKey("/data/computed_size_date"));
        Assert.Equal(size, args[0]["/data/computed_size"]);
        Assert.Equal(updateDate, args[0]["/data/computed_size_date"]);
    }

    [Fact]
    public async Task UpdateMetadataComputeSize_Failure()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataUpdater>>();
        var dataAccessMock = new Mock<IDataAccess>();
        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        var dateFormatterMock = new Mock<DateFormatter>();
        var metadataUpdater = new MetadataUpdater(loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, dateFormatterMock.Object);

        var dataPartitionId = "dataPartitionId";
        var metadataId = "metadataID";
        var size = 1024L;
        var cancellationToken = new CancellationToken();
        _ = cosmosClientFactoryMock.Setup(_ => _.GetCosmosConnectionStringAsync(dataPartitionId, cancellationToken))
            .ThrowsAsync(new CosmosException("Mocked exception", HttpStatusCode.NotFound, 123, "SomeActivityId", 0.0));

        // Act
        // Assert
        _ = await Assert.ThrowsAsync<CosmosException>(async () => await metadataUpdater.UpdateComputeSize(dataPartitionId, metadataId, size, cancellationToken));

    }
}
