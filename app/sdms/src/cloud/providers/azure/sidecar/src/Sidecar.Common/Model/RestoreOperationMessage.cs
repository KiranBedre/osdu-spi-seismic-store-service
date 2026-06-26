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

/// <summary>
/// Queue message contract for a dataset restore operation.
/// The requested target is the full dataset sd-path, while the Redis concurrency lock
/// is scoped at the tenant/data-partition level derived from sdPath.
/// </summary>
public class RestoreOperationMessage : IRestoreOperationMessage
{
    [JsonPropertyName("operation_id")]
    [JsonProperty("operationId")]
    [System.Text.Json.Serialization.JsonRequired]
    public string OperationId { get; set; } = "";

    [JsonPropertyName("createdBy")]
    [JsonProperty("createdBy")]
    public string CreatedBy { get; set; } = "";

    /// <summary>
    /// Full target dataset sd-path supplied by the caller.
    /// Example: sd://tenant/subproject/path/dataset
    /// </summary>
    [JsonPropertyName("sdPath")]
    [JsonProperty("sdPath")]
    [System.Text.Json.Serialization.JsonRequired]
    public string SdPath { get; set; } = "";

    /// <summary>
    /// ISO-8601 timestamp to restore blobs/metadata to (e.g. "2024-06-01T12:00:00Z").
    /// </summary>
    [JsonPropertyName("restorePointInTime")]
    [JsonProperty("restorePointInTime")]
    [System.Text.Json.Serialization.JsonRequired]
    public string RestorePointInTime { get; set; } = "";

    /// <summary>
    /// Correlation ID propagated from the originating HTTP request for distributed tracing.
    /// </summary>
    [JsonPropertyName("correlationId")]
    [JsonProperty("correlationId")]
    public string? CorrelationId { get; set; }
}
