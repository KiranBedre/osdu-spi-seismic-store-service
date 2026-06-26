// ============================================================================
// Copyright 2026, Microsoft
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

using System.Text.Json.Serialization;
using Newtonsoft.Json;
using Sidecar.Common.Interface;
using Sidecar.Common.Utility;

/// <summary>
/// Cosmos DB status document for a restore operation.
/// Stored in the RestoreOperationStatus container, partitioned by OperationId.
/// </summary>
public class RestoreOperationStatus : RestoreOperationMessage, IRestoreOperationStatus
{
    /// <summary>
    /// Cosmos DB document ID — equals OperationId for direct point reads.
    /// </summary>
    [JsonPropertyName("id")]
    [JsonProperty("id")]
    public string Id
    {
        get => OperationId;
        set => OperationId = value;
    }

    [JsonPropertyName("createdAt")]
    [JsonProperty("createdAt")]
    public string CreatedAt { get; set; } = DateTimeExtensions.UtcNowISOString();

    [JsonPropertyName("lastUpdatedAt")]
    [JsonProperty("lastUpdatedAt")]
    public string LastUpdatedAt { get; set; } = DateTimeExtensions.UtcNowISOString();

    /// <summary>
    /// Operation lifecycle status.
    /// Values: "InProgress" | "Succeeded" | "Failed" | "Rejected"
    /// </summary>
    [JsonPropertyName("status")]
    [JsonProperty("status")]
    public string Status { get; set; } = "";
}
