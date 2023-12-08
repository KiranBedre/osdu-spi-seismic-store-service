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

namespace Sidecar.ComputeSizeOperationRunner.Tests.Service;

using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using Sidecar.Common.Interface;
using Sidecar.Common.Service;
using Sidecar.ComputeSizeRunner;
using Xunit;

public class DatasetWriteLockManagerTests
{

    [Fact]
    public async Task LockDataset_Success()
    {
        // Arrange
        var lockManagerMock = new Mock<ILockManager>();
        var loggerMock = new Mock<ILogger<DatasetWriteLockManager>>();
        var datasetLockManager = new DatasetWriteLockManager(lockManagerMock.Object, loggerMock.Object);
        var lockKey = "lockKey";
        var writeLockSession = new WriteLockSession()
        {
            Key = "some key",
            Wid = "some value",
            Locked = true
        };
        _ = lockManagerMock.Setup(_ => _.AcquireWriteLockAsync(lockKey)).ReturnsAsync(writeLockSession);

        // Act
        var session = await datasetLockManager.LockDataset(lockKey);

        // Assert
        _ = session.Should().BeEquivalentTo(writeLockSession);
        lockManagerMock.Verify(_ => _.AcquireWriteLockAsync(lockKey), Times.Once);
    }

    [Fact]
    public async Task LockDataset_FailedFirstAttempts()
    {
        // Arrange
        var lockManagerMock = new Mock<ILockManager>();
        var loggerMock = new Mock<ILogger<DatasetWriteLockManager>>();
        var datasetLockManager = new DatasetWriteLockManager(lockManagerMock.Object, loggerMock.Object);
        var lockKey = "lockKey";
        var writeLockSessionFailedAttempt = new WriteLockSession();
        var writeLockSession = new WriteLockSession()
        {
            Key = "some key",
            Wid = "some value",
            Locked = true
        };
        _ = lockManagerMock.SetupSequence(_ => _.AcquireWriteLockAsync(lockKey))
            .ReturnsAsync(writeLockSessionFailedAttempt)
            .ReturnsAsync(writeLockSession);

        // Act
        var session = await datasetLockManager.LockDataset(lockKey);

        // Assert
        _ = session.Should().BeEquivalentTo(writeLockSession);
        lockManagerMock.Verify(_ => _.AcquireWriteLockAsync(lockKey), Times.Exactly(2));
    }

    [Fact]
    public async Task LockDataset_FailedAllAttempts()
    {
        // Arrange
        var lockManagerMock = new Mock<ILockManager>();
        var loggerMock = new Mock<ILogger<DatasetWriteLockManager>>();
        var datasetLockManager = new DatasetWriteLockManager(lockManagerMock.Object, loggerMock.Object);
        var lockKey = "lockKey";
        var writeLockSessionFailedAttempt = new WriteLockSession();
        _ = lockManagerMock.Setup(_ => _.AcquireWriteLockAsync(lockKey))
            .ReturnsAsync(writeLockSessionFailedAttempt);

        // Act
        var session = await datasetLockManager.LockDataset(lockKey);

        // Assert
        _ = session.Should().BeEquivalentTo(writeLockSessionFailedAttempt);
        lockManagerMock.Verify(_ => _.AcquireWriteLockAsync(lockKey), Times.Exactly(5));
    }

    [Fact]
    public async Task ReleaseLockDataset_Success()
    {
        // Arrange
        var lockManagerMock = new Mock<ILockManager>();
        var loggerMock = new Mock<ILogger<DatasetWriteLockManager>>();
        var datasetLockManager = new DatasetWriteLockManager(lockManagerMock.Object, loggerMock.Object);
        var lockKey = "lockKey";
        var writeLockSession = new WriteLockSession()
        {
            Locked = true
        };
        _ = lockManagerMock.Setup(_ => _.RemoveWriteLockAsync(writeLockSession)).ReturnsAsync(true);

        // Act
        await datasetLockManager.ReleaseLock(lockKey, writeLockSession);

        // Assert
        lockManagerMock.Verify(_ => _.RemoveWriteLockAsync(writeLockSession), Times.Once);
    }

    [Fact]
    public async Task ReleaseLockDataset_FailedFirstAttempt()
    {
        // Arrange
        var lockManagerMock = new Mock<ILockManager>();
        var loggerMock = new Mock<ILogger<DatasetWriteLockManager>>();
        var datasetLockManager = new DatasetWriteLockManager(lockManagerMock.Object, loggerMock.Object);
        var lockKey = "lockKey";
        var writeLockSession = new WriteLockSession()
        {
            Locked = true
        };
        _ = lockManagerMock.SetupSequence(_ => _.RemoveWriteLockAsync(writeLockSession))
            .ReturnsAsync(false)
            .ReturnsAsync(true);

        // Act
        await datasetLockManager.ReleaseLock(lockKey, writeLockSession);

        // Assert
        lockManagerMock.Verify(_ => _.RemoveWriteLockAsync(writeLockSession), Times.Exactly(2));
    }

    [Fact]
    public async Task ReleaseLockDataset_FailedAllAttempts()
    {
        // Arrange
        var lockManagerMock = new Mock<ILockManager>();
        var loggerMock = new Mock<ILogger<DatasetWriteLockManager>>();
        var datasetLockManager = new DatasetWriteLockManager(lockManagerMock.Object, loggerMock.Object);
        var lockKey = "lockKey";
        var writeLockSession = new WriteLockSession()
        {
            Locked = true
        };
        _ = lockManagerMock.Setup(_ => _.RemoveWriteLockAsync(writeLockSession))
            .ReturnsAsync(false);

        // Act
        await datasetLockManager.ReleaseLock(lockKey, writeLockSession);

        // Assert
        lockManagerMock.Verify(_ => _.RemoveWriteLockAsync(writeLockSession), Times.Exactly(5));
    }

    [Fact]
    public async Task ReleaseLockDataset_DatasetNotLocked_Failed()
    {
        // Arrange
        var lockManagerMock = new Mock<ILockManager>();
        var loggerMock = new Mock<ILogger<DatasetWriteLockManager>>();
        var datasetLockManager = new DatasetWriteLockManager(lockManagerMock.Object, loggerMock.Object);
        var lockKey = "lockKey";
        var writeLockSession = new WriteLockSession()
        {
            Locked = false
        };

        // Act
        await datasetLockManager.ReleaseLock(lockKey, writeLockSession);

        // Assert
        lockManagerMock.Verify(_ => _.RemoveWriteLockAsync(writeLockSession), Times.Never);
    }
}
