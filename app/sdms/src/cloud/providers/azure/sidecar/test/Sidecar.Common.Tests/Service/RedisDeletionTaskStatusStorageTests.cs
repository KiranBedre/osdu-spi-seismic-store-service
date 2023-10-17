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

using Sidecar.Common.Utility;

public class RedisDeletionTaskStatusStorageTests : RedisHandlerTests
{
    private readonly RedisDeletionTaskStatusStorage _statusStorage;
    private const string QUEUE_NAME = "somequeue";

    public RedisDeletionTaskStatusStorageTests()
    {
        _ = RedisConnectionFactory
            .Setup(m => m.GetRedisForQueue())
            .Returns(
                new RedisHandler(
                    TestingHelpers.GetLogger<RedisHandler>().Object,
                    ConnectionMultiplexer.Object
                ));

        var opts = new Options { QueueName = QUEUE_NAME };
            
        _statusStorage = new(opts, RedisConnectionFactory.Object);
    }

    [Fact]
    public async Task TaskStorageCreatesStatusFromOperation()
    {
        // Arrange
        IDeletionOperationMessage opMsg = TestingHelpers.GetDelOpMsg();
        var expectedMsgKeyInRedis = $"{QUEUE_NAME}:status:{opMsg.OperationId.ToLower()}";

        // Act
        var statusMsg = await _statusStorage.CreateDeletionOperationStatusAsync(opMsg);

        var msgFromRedis = ConnectionMultiplexer.Object.GetDatabase().HashGetAll(expectedMsgKeyInRedis).FromHashEntries<DeleteOperationStatus>();

        // Assert
        _ = msgFromRedis.Should().BeEquivalentTo(statusMsg);
        _ = statusMsg.Should().BeEquivalentTo(opMsg);
        
        _ = statusMsg.Status
            .Should()
            .Be(Status.Started.ToString());
        _ = statusMsg.StatusDescription
            .Should()
            .Be(Status.Started.Description());
        _ = statusMsg.DatasetsCnt
            .Should()
            .Be(0);
        _ = statusMsg.CompletedCnt
            .Should()
            .Be(0);
        _ = statusMsg.FailedCnt
            .Should()
            .Be(0);
    }
}
