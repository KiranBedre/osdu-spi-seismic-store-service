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

using Azure.Storage.Blobs;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;

namespace Sidecar.Common.Service
{
    using Azure.Core;
    using Azure.Security.KeyVault.Secrets;

    public class BlobClientFactory : IBlobClientFactory
    {
        private readonly ILogger<BlobClientFactory> _logger;
        private readonly IDesClient _desClient;
        private readonly SecretClient _secretClient;
        private readonly TokenCredential _credential;
        private readonly IOptionsStorageAccount _options;

        public BlobClientFactory(
            ILogger<BlobClientFactory> logger,
            IDesClient desClient,
            SecretClient secretClient,
            TokenCredential credential,
            IOptionsStorageAccount options)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _desClient = desClient;
            _secretClient = secretClient;
            _credential = credential;
            _options = options;
        }

        public async Task<IBlobClient> GetBlobClient(string dataPartitionId, CancellationToken ct = default)
        {
            if (!string.IsNullOrEmpty(_options.StorageAccountConnectionString))
            {
                return new BlobClient(new(_options.StorageAccountConnectionString));
            }

            var desConfig = await _desClient.GetPartitionConfiguration(dataPartitionId, ct);
            var storageAccountName = await desConfig.StorageAccountName.GetActualValue(_secretClient, ct);
            var storageAccountUri = new Uri($"https://{storageAccountName}.blob.core.windows.net");

            _logger.LogInformation("Establishing Storage account connection to {Uri} ...", storageAccountUri);
            var blobServiceClient = new BlobServiceClient(storageAccountUri, _credential);
            return new BlobClient(blobServiceClient);
        }
    }
}
