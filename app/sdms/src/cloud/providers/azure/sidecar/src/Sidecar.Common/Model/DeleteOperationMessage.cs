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

using Interface;
using System.Text.Json.Serialization;

public class DeleteOperationMessage : IDeletionOperationMessage
{
    [JsonPropertyName("operation_id")]
    [JsonRequired]
    public string OperationId { get; set; } = "";

    [JsonPropertyName("createdBy")]
    public string CreatedBy { get; set; } = "";

    [JsonPropertyName("tenant")]
    public string Tenant { get; set; } = "";

    [JsonPropertyName("subproject")]
    public string Subproject { get; set; } = "";

    [JsonPropertyName("query")]
    [JsonRequired]
    public string Query { get; set; } = "";

    [JsonPropertyName("parameters")]
    [JsonRequired]
    public string Parameters { get; set; } = "[]";
}
