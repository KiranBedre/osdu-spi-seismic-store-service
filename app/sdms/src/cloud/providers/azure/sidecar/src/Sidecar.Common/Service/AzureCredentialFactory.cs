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

using Azure.Core;
using Azure.Identity;

/// <summary>
/// Centralizes construction of Azure credentials for sidecar hosts and Redis MSI.
/// </summary>
public static class AzureCredentialFactory
{
    public static TokenCredential CreateDefault() => new DefaultAzureCredential();

    public static TokenCredential CreateManagedIdentity(string clientId) =>
        new ManagedIdentityCredential(clientId);

    public static TokenCredential CreateManagedIdentity() => new ManagedIdentityCredential();
}
