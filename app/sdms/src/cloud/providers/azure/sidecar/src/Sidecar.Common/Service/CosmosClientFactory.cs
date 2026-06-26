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

namespace Sidecar.Common.Service;

using System.Collections.Concurrent;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using Sidecar.Common.Resilience;

public class CosmosClientFactory(
    IDesClient desClient,
    SecretClient secretClient,
    ILogger<CosmosClientFactory> logger,
    CosmosDbRetryOptions? retryOptions = null) : ICosmosClientFactory, IDisposable
{
    private readonly ConcurrentDictionary<string, CosmosClient> _cosmosClients = new();
    private readonly CosmosDbRetryOptions _retryOptions = retryOptions ?? new CosmosDbRetryOptions();
    private bool _disposed;

    public async Task<string> GetCosmosConnectionEndpointAsync(string dataPartitionId, CancellationToken ct = default)
    {
        logger.LogInformation("Getting cosmos connection string");
        var desConfig = await desClient.GetPartitionConfigurationAsync(dataPartitionId, ct);
        var endpoint = await desConfig.CosmosEndpoint.GetActualValueAsync(secretClient, ct);
        return $"{endpoint}";
    }

    /// <summary>
    /// Gets or creates a cached CosmosClient for the given connection string.
    /// Uses AAD authentication with DefaultAzureCredential.
    /// Configures SDK-level retry for transient errors (429 rate limiting, etc.).
    /// </summary>
    public CosmosClient GetCosmosClient(string connectionString)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        try
        {
            logger.LogInformation("Initializing Cosmos client for endpoint: {ConnectionString}", connectionString);
            return _cosmosClients.GetOrAdd(
                connectionString,
                connStr => new CosmosClient(
                    connStr,
                    new DefaultAzureCredential(), // CodeQL [SM05141] In production, set AZURE_TOKEN_CREDENTIALS=prod to disable "Developer tool" credentials.
                    new CosmosClientOptions
                    {
                        SerializerOptions = new CosmosSerializationOptions
                        {
                            IgnoreNullValues = true
                        },
                        ConnectionMode = ConnectionMode.Gateway,
                        // SDK-level retry configuration for transient errors
                        MaxRetryAttemptsOnRateLimitedRequests = _retryOptions.MaxRetryAttemptsOnRateLimitedRequests,
                        MaxRetryWaitTimeOnRateLimitedRequests = _retryOptions.MaxRetryWaitTime
                    }
                )
            );
        }
        catch (CosmosException)
        {
            throw new InvalidOperationException("An error occurred while initializing the CosmosClient.", new Exception("CosmosDB error."));
        }
        catch (Exception)
        {
            throw new InvalidOperationException("An error occurred while initializing the CosmosClient.", new Exception("General error."));
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        foreach (var client in _cosmosClients.Values)
        {
            client.Dispose();
        }

        _cosmosClients.Clear();
        _disposed = true;
        GC.SuppressFinalize(this);
    }
}
