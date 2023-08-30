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
        Path = "tenant001/proj001/subproj007/"
    };

    internal static HashEntry[] GetDelOpMsgHashEntry(DeleteOperationMessage msg, bool useJsonAttrNames = false) => new HashEntry[]{
            new HashEntry(useJsonAttrNames?"operation_id":"OperationId", msg.OperationId),
            new HashEntry(useJsonAttrNames?"tenant":"Tenant",msg.Tenant),
            new HashEntry(useJsonAttrNames?"subproject":"Subproject",msg.Subproject),
            new HashEntry(useJsonAttrNames?"path":"Path",msg.Path)
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
        var db = new Mock<IDatabase>();
        var cache = new InMemoryCache();
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

        _ = db.Setup(d => d.HashSet(It.IsAny<RedisKey>(), It.IsAny<HashEntry[]>(), It.IsAny<CommandFlags>()))
            .Callback<RedisKey, HashEntry[], CommandFlags>((key, values, flags) =>
            {
                cache.HashSet(key, values);
            });

        _ = db.Setup(d => d.HashSetAsync(It.IsAny<RedisKey>(), It.IsAny<HashEntry[]>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, HashEntry[], CommandFlags>(async (key, values, flags) =>
            {
                _ = await cache.HashSetAsync(key, values);
            });

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

        db.Setup(d => d.HashIncrement(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<long>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, long?, CommandFlags>((key, field, inc, flags) =>
            {
                return cache.HashIncrement(key, field, inc);

            }).Verifiable();

        db.Setup(d => d.HashDecrement(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<long>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, long?, CommandFlags>((key, field, inc, flags) =>
            {
                return cache.HashDecrement(key, field, inc);

            }).Verifiable();

        db.Setup(d => d.KeyExistsAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>(async (key, flags) =>
            {
                return await cache.KeyExistsAsync(key!);
            }).Verifiable();

        db.Setup(d => d.KeyExists(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>((key, flags) =>
            {
                return cache.KeyExists(key!);
            }).Verifiable();

        db.Setup(d => d.ListLeftPush(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, When, CommandFlags>((key, value, when, flags) =>
            {
                return cache.ListLeftPush(key, value!);
            }).Verifiable();

        db.Setup(d => d.ListLeftPushAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, RedisValue, When, CommandFlags>(async (key, value, when, flags) =>
            {
                return await cache.ListLeftPushAsync(key, value!);
            }).Verifiable();

        db.Setup(d => d.ListLeftPop(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>((key, flags) =>
            {
                return cache.ListLeftPop(key);
            }).Verifiable();

        db.Setup(d => d.ListLeftPopAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>(async (key, flags) =>
            {
                return await cache.ListLeftPopAsync(key);
            }).Verifiable();

        db.Setup(d => d.HashGetAll(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>((key, flags) =>
            {
                return cache.HashGetAll(key);
            }).Verifiable();

        db.Setup(d => d.HashGetAllAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
            .Returns<RedisKey, CommandFlags>(async (key, flags) =>
            {
                return await cache.HashGetAllAsync(key);
            }).Verifiable();

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
