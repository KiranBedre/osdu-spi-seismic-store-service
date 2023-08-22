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
namespace Sidecar.Common.Tests
{
    using Moq;
    using StackExchange.Redis;
    using System.Threading.Tasks;
    using Xunit;
    public class QueueHandlerRedisTests
    {
        private readonly Mock<IConnectionMultiplexer> _mockConnectionMultiplexer;
        private readonly Mock<IDatabase> _mockDatabase;
        private readonly QueueHandlerRedisTests _queueHandlerRedisTests;

        public QueueHandlerRedisTests()
        {
            _mockConnectionMultiplexer = new Mock<IConnectionMultiplexer>();
            _mockDatabase = new Mock<IDatabase>();
            _redisCache = new RedisCache(_mockConnectionMultiplexer.Object);

            _mockConnectionMultiplexer.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(_mockDatabase.Object);
        }

        [Fact]
        public async Task GetAsync_WhenCalled_ReturnsCachedValue()
        {
            // Arrange
            var key = "test-key";
            var value = "test-value";
            _mockDatabase.Setup(x => x.StringGetAsync(key, CommandFlags.None)).ReturnsAsync(value);

            // Act
            var result = await _redisCache.GetAsync<string>(key);

            // Assert
            Assert.Equal(value, result);
        }

        [Fact]
        public async Task SetAsync_WhenCalled_SetsValueInCache()
        {
            // Arrange
            var key = "test-key";
            var value = "test-value";
            var expiry = TimeSpan.FromMinutes(10);
            _mockDatabase.Setup(x => x.StringSetAsync(key, value, expiry, When.Always, CommandFlags.None)).ReturnsAsync(true);

            // Act
            await _redisCache.SetAsync(key, value, expiry);

            // Assert
            _mockDatabase.Verify(x => x.StringSetAsync(key, value, expiry, When.Always, CommandFlags.None), Times.Once);
        }

        [Fact]
        public async Task RemoveAsync_WhenCalled_RemovesValueFromCache()
        {
            // Arrange
            var key = "test-key";
            _mockDatabase.Setup(x => x.KeyDeleteAsync(key, CommandFlags.None)).ReturnsAsync(true);

            // Act
            await _redisCache.RemoveAsync(key);

            // Assert
            _mockDatabase.Verify(x => x.KeyDeleteAsync(key, CommandFlags.None), Times.Once);
        }
    }
}