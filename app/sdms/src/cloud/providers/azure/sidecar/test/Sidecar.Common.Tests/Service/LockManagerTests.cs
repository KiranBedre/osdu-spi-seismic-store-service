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

using Sidecar.DeleteOperationRunner.Services;

namespace Sidecar.Common.Tests.Service
{
    public class LockManagerTests
    {
        private LockManager LockManager;
        protected readonly Mock<IConnectionMultiplexer> ConnectionMultiplexer = new ();

        public LockManagerTests()
        {
            ConnectionMultiplexer = TestingHelpers.GetConnectionMultiplexer(db: TestingHelpers.GetDatabase().Object);
            var factoryMock = new Mock<IRedisConnectionFactory>();
            factoryMock.Setup(m => m.GetRedisForLocks()).Returns(ConnectionMultiplexer.Object);
            var Logger = new Mock<ILogger<LockManager>>();
            LockManager = new LockManager(Logger.Object, factoryMock.Object);
        }


        [Fact]
        public async Task AcquireDeleteLock_WithLockWrite_ReturnsTrue()
        {
            // Arrange

            var databaseMock = new Mock<IDatabase>();
            ConnectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);
            var key = "/path/file.tst";
            databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
                .ReturnsAsync(true);
            databaseMock.Setup(db => db.StringGetAsync(key, CommandFlags.None)).ReturnsAsync("WDELETE:lockValue");

            // Act
            var result = await LockManager.AcquireDeleteLock(key);

            // Assert
            Assert.True(result);
        }


        [Fact]
        public async Task AcquireDeleteLock_WithValidLockRead_ReturnsFalse()
        {
            // Arrange

            var databaseMock = new Mock<IDatabase>();
            ConnectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);
            var key = "/path/file.tst";
            databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
                .ReturnsAsync(true);
            databaseMock.Setup(db => db.StringGetAsync(key, CommandFlags.None)).ReturnsAsync("RLockValue");

            // Act
            var result = await LockManager.AcquireDeleteLock(key);

            // Assert
            Assert.False(result);
        }

        [Fact]
        public async Task AcquireDeleteLock_WithoutLock_ReturnsTrue()
        {
            // Arrange
            var databaseMock = new Mock<IDatabase>();
            ConnectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);
            var key = "/path/file.tst";
            databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
                .ReturnsAsync(true);
            databaseMock.Setup(db => db.StringGetAsync(key, CommandFlags.None)).ReturnsAsync((string?)null);
            databaseMock
               .Setup(client => client.StringSetAsync(
                   It.IsAny<RedisKey>(),
                   It.IsAny<RedisValue>(),
                   It.IsAny<TimeSpan?>(),
                   It.IsAny<bool>(),
                   It.IsAny<When>(),
                   It.IsAny<CommandFlags>()
               ))
               .ReturnsAsync(true);

            // Act
            var result = await LockManager.AcquireDeleteLock(key);

            // Assert
            Assert.True(result);
        }

        [Fact]
        public async Task AcquireDeleteLock_WithoutMutex_ThrowsException()
        {
            // Arrange
            var databaseMock = new Mock<IDatabase>();
            ConnectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);

            databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
                        .ThrowsAsync(new Exception("Lock take failed"));

            // Act & Assert
            await Assert.ThrowsAsync<Exception>(() => LockManager.AcquireDeleteLock("testKey"));
        }
    }
}
