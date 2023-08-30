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

public class RedisHandlerTests
{
    protected readonly Mock<IDatabase> DbMock = TestingHelpers.GetDatabase();
    protected readonly Mock<IConnectionMultiplexer> ConnectionMultiplexer;
    protected readonly Mock<IRedisConnectionFactory> RedisConnectionFactory = new();

    public RedisHandlerTests()
    {
        ConnectionMultiplexer = TestingHelpers.GetConnectionMultiplexer(db: DbMock.Object); ;
    }

    private RedisHandler GetQueueHandler() => new RedisHandler(
        TestingHelpers.GetLogger<RedisHandler>().Object,
        ConnectionMultiplexer.Object);

    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    [InlineData(10)]
    [InlineData(int.MaxValue)]
    private void HashSet_HashIncrement_Success(int? inc)
    {
        // Arrange
        var linc = (long?)inc; //--xunit + dotnet has a problem casting from int? when the param is a long?
        var queueHandler = GetQueueHandler();
        var key = "HashSet_IncrHash_Success:inc";
        var field = "cnt";
        var initialValue = 6;

        // Act
        var result = queueHandler.HashSet(key, field, initialValue.ToString());
        var returned = queueHandler.HashIncrement(key, field, inc);

        // Assert
        result
            .Should()
            .BeTrue();
        returned
            .Should()
            .Be(initialValue + linc.GetValueOrDefault(1));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    [InlineData(10)]
    [InlineData(int.MaxValue)]
    private void HashSet_HashDecrement_Success(int? inc)
    {
        // Arrange
        var linc = (long?)inc; //--xunit + dotnet has a problem casting from int? when the param is a long?
        var queueHandler = GetQueueHandler();
        var key = "HashSet_HashDecrement_Success:dec";
        var field = "cnt";
        var initialValue = 10;

        // Act
        var result = queueHandler.HashSet(key, field, initialValue.ToString());
        var returned = queueHandler.HashDecrement(key, field, inc);

        // Assert
        result
            .Should()
            .BeTrue();
        returned
            .Should()
            .Be(initialValue - linc.GetValueOrDefault(1));
    }

    [Fact]
    private void HashSet_HashGet_Success()
    {
        // Arrange
        var queueHandler = GetQueueHandler();
        var key = "HashSet_HashGet_Success:hs";
        var field = "cnt";
        var initialValue = 1;

        // Act
        var result = queueHandler.HashSet(key, field, initialValue.ToString());
        var returned = queueHandler.HashGet<long>(key, field);

        // Assert
        result
            .Should()
            .BeTrue();
        returned
            .Should()
            .Be(initialValue);
    }

    [Fact]
    private async Task HashSetAsync_HashGetAsync_Success()
    {
        // Arrange
        var queueHandler = GetQueueHandler();
        var key = "HashSetAsync_Success:hsa";
        var field = "cnt";
        var initialValue = 1;

        // Act
        var result = await queueHandler.HashSetAsync(key, field, initialValue.ToString());
        var returned = await queueHandler.HashGetAsync<long>(key, field);

        // Assert
        result
            .Should()
            .BeTrue();
        returned
            .Should()
            .Be(initialValue);
    }

}
