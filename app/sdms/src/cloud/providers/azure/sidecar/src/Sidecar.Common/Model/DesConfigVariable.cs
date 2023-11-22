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

namespace Sidecar.Common.Model;

using Azure.Security.KeyVault.Secrets;
using Newtonsoft.Json;

public class DesConfigVariable
{
    /// <summary>
    /// If <see cref="Sensitive"/> is true, this is the name of a secret in the KeyVault where to find the value.
    /// If <see cref="Sensitive"/> is false, this is the value itself.
    /// </summary>
    [JsonProperty("value")]
    public string Value { get; set; } = "";

    /// <summary>
    /// Hit on how to interpret the <see cref="Value"/>.
    /// </summary>
    [JsonProperty("sensitive")]
    public bool Sensitive { get; set; }

    public async Task<string> GetActualValueAsync(SecretClient secretClient, CancellationToken ct)
    {
        if (!Sensitive)
        {
            return Value;
        }

        var secretResponse = await secretClient.GetSecretAsync(Value, cancellationToken: ct);

        if (!secretResponse.HasValue)
        {
            throw new($"Not found the secret {Value}");
        }

        return secretResponse.Value.Value;
    }
}

