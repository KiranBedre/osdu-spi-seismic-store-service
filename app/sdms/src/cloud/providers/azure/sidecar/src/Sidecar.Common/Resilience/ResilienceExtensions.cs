// ============================================================================
// Copyright 2017-2024, Microsoft
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

namespace Sidecar.Common.Resilience;

using System.Net;
using System.Net.Sockets;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Polly;
using Polly.Retry;
using StackExchange.Redis;

public static class ResilienceExtensions
{
    public const string RedisPipeline = "redis-pipeline";
    public const string GeneralPipeline = "general-pipeline";

    public static IServiceCollection AddResiliencePipelines(
        this IServiceCollection services,
        Action<ResilienceOptions>? configure = null)
    {
        services.AddOptions<ResilienceOptions>()
            .Configure(options => configure?.Invoke(options));

        services.AddResiliencePipeline(RedisPipeline, (builder, context) =>
        {
            var opts = context.ServiceProvider
                .GetRequiredService<IOptions<ResilienceOptions>>().Value.Redis;
            var logger = context.ServiceProvider.GetService<ILoggerFactory>()
                ?.CreateLogger("Resilience.Redis");

            builder.AddRetry(new RetryStrategyOptions
            {
                ShouldHandle = new PredicateBuilder().Handle<Exception>(IsTransientRedisError),
                MaxRetryAttempts = opts.MaxRetryAttempts,
                Delay = opts.BaseDelay,
                MaxDelay = opts.MaxDelay,
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = opts.UseJitter,
                OnRetry = args =>
                {
                    logger?.LogWarning(
                        args.Outcome.Exception,
                        "[Redis] Retry attempt {AttemptNumber}/{MaxAttempts} after {Delay}ms",
                        args.AttemptNumber,
                        opts.MaxRetryAttempts,
                        args.RetryDelay.TotalMilliseconds);
                    return ValueTask.CompletedTask;
                }
            });
        });

        services.AddResiliencePipeline(GeneralPipeline, (builder, context) =>
        {
            var opts = context.ServiceProvider
                .GetRequiredService<IOptions<ResilienceOptions>>().Value.General;
            var logger = context.ServiceProvider.GetService<ILoggerFactory>()
                ?.CreateLogger("Resilience.General");

            builder.AddRetry(new RetryStrategyOptions
            {
                ShouldHandle = new PredicateBuilder().Handle<Exception>(IsTransientGeneralError),
                MaxRetryAttempts = opts.MaxRetryAttempts,
                Delay = opts.BaseDelay,
                MaxDelay = opts.MaxDelay,
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = opts.UseJitter,
                OnRetry = args =>
                {
                    logger?.LogWarning(
                        args.Outcome.Exception,
                        "[General] Retry attempt {AttemptNumber}/{MaxAttempts} after {Delay}ms",
                        args.AttemptNumber,
                        opts.MaxRetryAttempts,
                        args.RetryDelay.TotalMilliseconds);
                    return ValueTask.CompletedTask;
                }
            });
        });

        return services;
    }

    private const int MaxExceptionUnwrapDepth = 10;

    public static bool IsTransientRedisError(Exception ex)
    {
        var current = ex;
        var depth = 0;

        while (current != null && depth < MaxExceptionUnwrapDepth)
        {
            if (IsDirectTransientRedisError(current))
            {
                return true;
            }

            current = current.InnerException;
            depth++;
        }

        return false;
    }

    private static bool IsDirectTransientRedisError(Exception ex) => ex switch
    {
        RedisConnectionException => true,
        RedisTimeoutException => true,
        RedisServerException redisException when IsTransientRedisServerError(redisException) => true,
        SocketException => true,
        IOException ioException when IsNetworkIOException(ioException) => true,
        _ => false
    };

    public static bool IsTransientGeneralError(Exception ex)
    {
        var current = ex;
        var depth = 0;

        while (current != null && depth < MaxExceptionUnwrapDepth)
        {
            if (IsDirectTransientGeneralError(current))
            {
                return true;
            }

            current = current.InnerException;
            depth++;
        }

        return false;
    }

    private static bool IsDirectTransientGeneralError(Exception ex) => ex switch
    {
        SocketException => true,
        IOException ioException when IsNetworkIOException(ioException) => true,
        HttpRequestException => true,
        TimeoutException => true,
        TaskCanceledException taskCanceledException
            when !taskCanceledException.CancellationToken.IsCancellationRequested => true,
        CosmosException cosmosException when IsTransientCosmosError(cosmosException) => true,
        _ => false
    };

    public static bool IsTransientCosmosError(CosmosException ex) => ex.StatusCode switch
    {
        HttpStatusCode.RequestTimeout => true,
        HttpStatusCode.TooManyRequests => true,
        HttpStatusCode.InternalServerError => false,
        HttpStatusCode.BadGateway => true,
        HttpStatusCode.ServiceUnavailable => true,
        HttpStatusCode.GatewayTimeout => true,
        _ => false
    };

    private static bool IsTransientRedisServerError(RedisServerException ex)
    {
        var message = ex.Message.ToUpperInvariant();
        return message.Contains("BUSY")
            || message.Contains("LOADING")
            || message.Contains("CLUSTERDOWN")
            || message.Contains("TRYAGAIN");
    }

    private static bool IsNetworkIOException(IOException ex) =>
        ex.InnerException is SocketException
        || ex.Message.Contains("network", StringComparison.OrdinalIgnoreCase)
        || ex.Message.Contains("connection", StringComparison.OrdinalIgnoreCase);
}
