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

using System.Data.Common;
using Microsoft.Extensions.Logging;

#pragma warning disable CS8600
internal static partial class TestingHelpers
{
    internal static Mock<ILogger<T>> GetLogger<T>()
    {
        var logger = new Mock<ILogger<T>>();

        _ = logger.Setup(x => x.Log(
            It.IsAny<LogLevel>(),
            It.IsAny<EventId>(),
            It.IsAny<It.IsAnyType>(),
            It.IsAny<Exception?>(),
            (Func<It.IsAnyType, Exception?, string>)It.IsAny<object>()))
            .Callback(new InvocationAction(a =>
            {
                var logLevel = (LogLevel)a.Arguments[0];
                var eventId = (EventId)a.Arguments[1];
                var state = a.Arguments[2];
                var exception = (Exception)a.Arguments[3];
                var formatter = a.Arguments[4];

                var invokeMethod = formatter.GetType().GetMethod("Invoke");
                var logMessage = (string)invokeMethod?.Invoke(formatter!, new[] { state!, exception! });

                Console.Write(logMessage);

            }));

        return logger;
    }

    internal static Mock<IDatabase> GetDatabase(){
        var db = new Mock<IDatabase>();
        var cache = new InMemoryCache<RedisValue>();

        db.Setup(d => d.HashSet(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, RedisValue, When, CommandFlags>((key, field, value, when, flags) =>
            {
                return cache.HashSet(key, field, value);
            }).Verifiable();

        db.Setup(d => d.HashSetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, RedisValue, When, CommandFlags>(async (key, field, value, when, flags) =>
            {
                return await cache.HashSetAsync(key, field, value);
            }).Verifiable();

        db.Setup(d => d.HashGetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, CommandFlags>(async (key, field, flags) =>
            {
                return await cache.HashGetAsync(key, field);

            }).Verifiable();

        db.Setup(d => d.HashGet(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, CommandFlags>((key, field, flags) =>
            {
                return cache.HashGet(key, field);

            }).Verifiable();

        return db;
    }

    internal static Mock<IConnectionMultiplexer> GetConnectionMultiplexer(IDatabase db){
        var cm = new Mock<IConnectionMultiplexer>();

        _ = cm.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(db);
        _ = cm.Setup(_ => _.IsConnected).Returns(true);

        return cm;
    }
}