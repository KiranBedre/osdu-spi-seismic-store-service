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
#pragma warning disable CS8600

internal static partial class TestingHelpers
{
    internal static DeleteOperationMessage GetDelOpMsg() => new()
    {
        OperationId = Guid.NewGuid().ToString(),
        Tenant = "tenant001",
        Subproject = "subproj007",
        Query = "SELECT c.id FROM c",
    };

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

    internal static Mock<IDatabase> GetDatabase()
    {
        return GetDatabase(out _);
    }

    internal static Mock<IDatabase> GetDatabase(out InMemoryCache cache)
    {
        var db = new Mock<IDatabase>(MockBehavior.Loose); // Changed to Loose to support String operations with optional params
        var localCache = new InMemoryCache();
        cache = localCache;

        db.Setup(d => d.KeyExpire(It.IsAny<RedisKey>(), It.IsAny<TimeSpan?>(), It.IsAny<ExpireWhen>(), It.IsAny<CommandFlags>()))
            .Returns(true).Verifiable();

        db.Setup(d => d.KeyExpireAsync(It.IsAny<RedisKey>(), It.IsAny<TimeSpan?>(), It.IsAny<ExpireWhen>(), It.IsAny<CommandFlags>()))
            .ReturnsAsync(true).Verifiable();

        db.Setup(d => d.HashSet(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, RedisValue, When, CommandFlags>((key, field, value, when, flags) =>
            {
                return localCache.HashSet(key, field, value);
            }).Verifiable();

        db.Setup(d => d.HashSetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, RedisValue, When, CommandFlags>(async (key, field, value, when, flags) =>
            {
                return await localCache.HashSetAsync(key, field, value);
            }).Verifiable();

        _ = db.Setup(d => d.HashSet(It.IsAny<RedisKey>(), It.IsAny<HashEntry[]>(), It.IsAny<CommandFlags>()))
            .Callback<RedisKey, HashEntry[], CommandFlags>((key, values, flags) =>
            {
                localCache.HashSet(key, values);
            });

        _ = db.Setup(d => d.HashSetAsync(It.IsAny<RedisKey>(), It.IsAny<HashEntry[]>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, HashEntry[], CommandFlags>(async (key, values, flags) =>
            {
                _ = await localCache.HashSetAsync(key, values);
            });

        db.Setup(d => d.HashGetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, CommandFlags>(async (key, field, flags) =>
            {
                return await localCache.HashGetAsync(key, field);
            }).Verifiable();

        db.Setup(d => d.HashGet(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, CommandFlags>((key, field, flags) =>
            {
                return localCache.HashGet(key, field);
            }).Verifiable();

        db.Setup(d => d.HashIncrement(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<long>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, long?, CommandFlags>((key, field, inc, flags) =>
            {
                return localCache.HashIncrement(key, field, inc);
            }).Verifiable();

        db.Setup(d => d.HashDecrement(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<long>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, long?, CommandFlags>((key, field, inc, flags) =>
            {
                return localCache.HashDecrement(key, field, inc);
            }).Verifiable();

        db.Setup(d => d.KeyExistsAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>(async (key, flags) =>
            {
                return await localCache.KeyExistsAsync(key!);
            }).Verifiable();

        db.Setup(d => d.KeyExists(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>((key, flags) =>
            {
                return localCache.KeyExists(key!);
            }).Verifiable();

        db.Setup(d => d.ListLeftPush(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, When, CommandFlags>((key, value, when, flags) =>
            {
                return localCache.ListLeftPush(key, value!);
            }).Verifiable();

        db.Setup(d => d.ListLeftPushAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, When, CommandFlags>(async (key, value, when, flags) =>
            {
                return await localCache.ListLeftPushAsync(key, value!);
            }).Verifiable();

        db.Setup(d => d.ListRightPush(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, When, CommandFlags>((key, value, when, flags) =>
            {
                return localCache.ListRightPush(key, value!);
            }).Verifiable();

        db.Setup(d => d.ListRightPushAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, When, CommandFlags>(async (key, value, when, flags) =>
            {
                return await localCache.ListRightPushAsync(key, value!);
            }).Verifiable();

        db.Setup(d => d.ListLeftPop(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>((key, flags) =>
            {
                return localCache.ListLeftPop(key);
            }).Verifiable();

        db.Setup(d => d.ListRange(It.IsAny<RedisKey>(), It.IsAny<long>(), It.IsAny<long>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, long, long, CommandFlags>((key, start, stop, flags) =>
            {
                return localCache.ListRange(key, start, stop);
            }).Verifiable();

        db.Setup(d => d.ListLeftPopAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>(async (key, flags) =>
            {
                return await localCache.ListLeftPopAsync(key);
            }).Verifiable();

        db.Setup(d => d.HashGetAll(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>((key, flags) =>
            {
                return localCache.HashGetAll(key);
            }).Verifiable();

        db.Setup(d => d.HashGetAllAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>(async (key, flags) =>
            {
                return await localCache.HashGetAllAsync(key);
            }).Verifiable();

        db.Setup(d => d.KeyDeleteAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>(async (key, flags) =>
            {
                return await localCache.KeyDeleteAsync(key);
            }).Verifiable();

        // Lock operations - simple implementation that always succeeds for testing
        db.Setup(d => d.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
            .ReturnsAsync(true).Verifiable();

        db.Setup(d => d.LockReleaseAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<CommandFlags>()))
            .ReturnsAsync(true).Verifiable();

        return db;
    }

    internal static Mock<IConnectionMultiplexer> GetConnectionMultiplexer(IDatabase db)
    {
        var cm = new Mock<IConnectionMultiplexer>();

        _ = cm.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(db);
        _ = cm.Setup(_ => _.IsConnected).Returns(true);

        return cm;
    }
}
