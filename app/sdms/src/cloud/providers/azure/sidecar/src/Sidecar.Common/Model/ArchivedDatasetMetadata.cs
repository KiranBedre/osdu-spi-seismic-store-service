// ============================================================================
// Copyright 2026, Microsoft Corporation
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
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Linq;

/// <summary>
/// Represents an archived snapshot of a dataset's metadata state,
/// stored in the archive container for point-in-time restore.
/// Both System.Text.Json (JsonPropertyName) and Newtonsoft (JsonProperty)
/// attributes are declared because the Cosmos SDK serializes with Newtonsoft
/// by default, while other code paths may use System.Text.Json.
/// </summary>
public class ArchivedDatasetMetadata
{
    [JsonPropertyName("id")]
    [JsonProperty("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("sdPath")]
    [JsonProperty("sdPath")]
    public string SdPath { get; set; } = string.Empty;

    [JsonPropertyName("archivedAtEpochMs")]
    [JsonProperty("archivedAtEpochMs")]
    public long ArchivedAt { get; set; }

    [JsonPropertyName("operation")]
    [JsonProperty("operation")]
    [System.Text.Json.Serialization.JsonConverter(typeof(JsonStringEnumConverter))]
    [Newtonsoft.Json.JsonConverter(typeof(StringEnumConverter))]
    public ArchiveOperation Operation { get; set; }

    [JsonPropertyName("datasetCreatedAtEpochMs")]
    [JsonProperty("datasetCreatedAtEpochMs")]
    public long DatasetCreatedAt { get; set; }

    [JsonPropertyName("versionCreatedAtEpochMs")]
    [JsonProperty("versionCreatedAtEpochMs")]
    public long VersionCreatedAt { get; set; }

    [JsonPropertyName("document")]
    [JsonProperty("document")]
    public JToken? Document { get; set; }

    [JsonPropertyName("ttl")]
    [JsonProperty("ttl")]
    public int Ttl { get; set; }
}
