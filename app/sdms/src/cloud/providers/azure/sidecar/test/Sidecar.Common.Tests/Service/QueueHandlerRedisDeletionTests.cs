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

namespace Sidecar.Common.Tests;

public class QueueHandlerRedisDeletionTests : QueueHandlerRedisTests
{
    public QueueHandlerRedisDeletionTests() : base(){

    }

    private QueueHandlerRedisDeletion GetQueueHander() => new QueueHandlerRedisDeletion(
            TestingHelpers.GetLogger<QueueHandlerRedisDeletion>().Object
            , new Options
            {
                QueueConnectionString = "somehost:1234",
                QueueName = "somequeue"
            }
            , ConnectionMultiplexer.Object);

    [Fact]
    private void IncrementCountAsync_Success()
    {
        // Arrange

        // Act

        // Assert
    }
}