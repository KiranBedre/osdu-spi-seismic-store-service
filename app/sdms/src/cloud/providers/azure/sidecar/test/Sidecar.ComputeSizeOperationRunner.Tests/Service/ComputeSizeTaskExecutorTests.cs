namespace Sidecar.ComputeSizeOperationRunner.Tests.Service;

using Microsoft.Extensions.Logging;
using Moq;
using Sidecar.Common.Model;
using Sidecar.Common.Service;
using Sidecar.ComputeSizeRunner;
using Xunit;

public class ComputeSizeTaskExecutorTests
{
    private const long SIZE = 1024;
    private static readonly CancellationToken _cancellationToken = new();

    [Fact]
    public async Task ProcessSizeCompute_UpdateSize()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<ComputeSizeTaskExecutor>>();
        var blobSizesRetrieverMock = new Mock<IDatasetSizeRetriever>();
        var metadataUpdaterMock = new Mock<IMetadataUpdater>();
        var lockManagerMock = new Mock<IDatasetWriteLockManager>();
        var executor = new ComputeSizeTaskExecutor(loggerMock.Object, blobSizesRetrieverMock.Object, metadataUpdaterMock.Object, lockManagerMock.Object);
        var message = CreateMessage(0);
        var datasetFullName = message.Tenant + "/" + message.Subproject + message.Path + message.Name;
        _ = blobSizesRetrieverMock.Setup(_ => _.RetrieveSize(message, _cancellationToken)).ReturnsAsync(SIZE);
        var writeLockSession = new WriteLockSession()
        {
            Key = "someKey",
            Wid = "someId",
            Locked = true
        };
        _ = lockManagerMock.Setup(_ => _.LockDataset(datasetFullName)).ReturnsAsync(writeLockSession);


        // Act
        await executor.ProcessAsync(message, _cancellationToken);

        // Assert
        lockManagerMock.Verify(_ => _.LockDataset(datasetFullName), Times.Once);
        lockManagerMock.Verify(_ => _.ReleaseLock(datasetFullName, writeLockSession), Times.Once);
        blobSizesRetrieverMock.Verify(_ => _.RetrieveSize(message, CancellationToken.None), Times.Once);
        metadataUpdaterMock.Verify(_ => _.UpdateComputeSize(message.Tenant, message.DatasetId, SIZE, _cancellationToken), Times.Once);
    }

    [Fact]
    public async Task ProcessSizeCompute_WithoutSizeUpdate()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<ComputeSizeTaskExecutor>>();
        var blobSizesRetrieverMock = new Mock<IDatasetSizeRetriever>();
        var metadataUpdaterMock = new Mock<IMetadataUpdater>();
        var lockManagerMock = new Mock<IDatasetWriteLockManager>();
        var executor = new ComputeSizeTaskExecutor(loggerMock.Object, blobSizesRetrieverMock.Object, metadataUpdaterMock.Object, lockManagerMock.Object);
        var message = CreateMessage(SIZE);
        var datasetFullName = message.Tenant + "/" + message.Subproject + message.Path + message.Name;
        var writeLockSession = new WriteLockSession()
        {
            Key = "someKey",
            Wid = "someId",
            Locked = true
        };
        _ = lockManagerMock.Setup(_ => _.LockDataset(datasetFullName)).ReturnsAsync(writeLockSession);
        _ = blobSizesRetrieverMock.Setup(_ => _.RetrieveSize(message, _cancellationToken)).ReturnsAsync(SIZE);

        // Act
        await executor.ProcessAsync(message, _cancellationToken);

        // Assert
        blobSizesRetrieverMock.Verify(_ => _.RetrieveSize(message, _cancellationToken), Times.Once);
        lockManagerMock.Verify(_ => _.LockDataset(datasetFullName), Times.Never);
        lockManagerMock.Verify(_ => _.ReleaseLock(datasetFullName, writeLockSession), Times.Never);
        metadataUpdaterMock.Verify(_ => _.UpdateComputeSize(message.Tenant, message.DatasetId, SIZE, _cancellationToken), Times.Never);
    }

    [Fact]
    public async Task ProcessSizeCompute_NoUpdate_DatasetNotLocked()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<ComputeSizeTaskExecutor>>();
        var blobSizesRetrieverMock = new Mock<IDatasetSizeRetriever>();
        var metadataUpdaterMock = new Mock<IMetadataUpdater>();
        var lockManagerMock = new Mock<IDatasetWriteLockManager>();
        var executor = new ComputeSizeTaskExecutor(loggerMock.Object, blobSizesRetrieverMock.Object, metadataUpdaterMock.Object, lockManagerMock.Object);
        var message = CreateMessage(0);
        var datasetFullName = message.Tenant + "/" + message.Subproject + message.Path + message.Name;
        var writeLockSession = new WriteLockSession()
        {
            Key = "someKey",
            Wid = "someId",
            Locked = false
        };
        _ = lockManagerMock.Setup(_ => _.LockDataset(datasetFullName)).ReturnsAsync(writeLockSession);
        _ = blobSizesRetrieverMock.Setup(_ => _.RetrieveSize(message, _cancellationToken)).ReturnsAsync(SIZE);

        // Act
        await executor.ProcessAsync(message, _cancellationToken);

        // Assert
        blobSizesRetrieverMock.Verify(_ => _.RetrieveSize(message, _cancellationToken), Times.Once);
        lockManagerMock.Verify(_ => _.LockDataset(datasetFullName), Times.Once);
        lockManagerMock.Verify(_ => _.ReleaseLock(datasetFullName, writeLockSession), Times.Never);
        metadataUpdaterMock.Verify(_ => _.UpdateComputeSize(message.Tenant, message.DatasetId, SIZE, _cancellationToken), Times.Never);
    }

    private static ComputeSizeOperationMessage CreateMessage(long datasetSize) => new()
    {
        Tenant = "read",
        BlobsPath = "container1/folderA/folderB",
        DatasetId = "datasetId",
        DatasetSize = datasetSize,
        OperationId = "operationId1"
    };
}
