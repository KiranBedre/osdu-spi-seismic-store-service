namespace Sidecar.Common.Service;

using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using StackExchange.Redis;
using System.Collections.Concurrent;
using System.Threading.Tasks;

public abstract class RedisConnectionProviderBase : IRedisConnectionProvider
{
    protected readonly ILogger<RedisConnectionProviderBase> _logger;
    protected int _connectTimeout;
    protected int _syncTimeout;

    private readonly ConcurrentDictionary<string, IConnectionMultiplexer> _connections = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _connectionLocks = new();

    protected RedisConnectionProviderBase(ILogger<RedisConnectionProviderBase> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc/>
    public async Task<IConnectionMultiplexer> GetConnectionAsync(string hostname, int port)
    {
        if (string.IsNullOrWhiteSpace(hostname))
        {
            throw new ArgumentException("Redis hostname cannot be null or empty", nameof(hostname));
        }

        var cacheKey = $"{hostname}:{port}";

        // Return cached connection if available
        if (_connections.TryGetValue(cacheKey, out var existingConnection))
        {
            _logger.LogInformation("Using existing Redis connection to {Host}:{Port}", hostname, port);
            return existingConnection;
        }

        // Get or create a semaphore for this specific connection key
        var semaphore = _connectionLocks.GetOrAdd(cacheKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync();
        try
        {
            // Double-check after acquiring the lock
            if (_connections.TryGetValue(cacheKey, out existingConnection))
            {
                _logger.LogInformation("Using existing Redis connection to {Host}:{Port} (acquired after lock)", hostname, port);
                return existingConnection;
            }

            // Create the connection while holding the lock
            var connection = await CreateConnectionAsync(hostname, port);

            _connections[cacheKey] = connection;
            _logger.LogInformation("Created new Redis connection to {Host}:{Port}", hostname, port);

            return connection;
        }
        finally
        {
            semaphore.Release();
        }
    }

    /// <inheritdoc/>
    public abstract Task<IConnectionMultiplexer> CreateConnectionAsync(string hostname, int port);

    public void Dispose()
    {
        foreach (var connection in _connections.Values)
        {
            try
            {
                connection.Dispose();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing Redis connection");
            }
        }

        _connections.Clear();

        foreach (var semaphore in _connectionLocks.Values)
        {
            try
            {
                semaphore.Dispose();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing connection lock semaphore");
            }
        }

        _connectionLocks.Clear();
    }
}
