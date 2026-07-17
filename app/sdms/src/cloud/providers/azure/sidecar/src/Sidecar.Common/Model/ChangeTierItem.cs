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

using System.Text.Json.Serialization;
using Sidecar.Common.Utility;

public class ChangeTierItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("gcsurl")]
    public string? Gcsurl { get; set; }

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("tenant")]
    public string Tenant { get; set; } = "";

    [JsonPropertyName("subproject")]
    public string Subproject { get; set; } = "";

    /// <summary>
    /// Dataset-level ACLs. Present only when subproject access_policy is 'dataset'.
    /// Contains admin and viewer groups that have access to this specific dataset.
    /// </summary>
    [JsonPropertyName("acls")]
    public DatasetAcl? Acls { get; set; }

    /// <summary>
    /// Gets the lock key path: {tenant}/{subproject}/{path}/{name}
    /// </summary>
    [JsonIgnore]
    public string LockKeyPath
    {
        get
        {
            var datasetPath = Path.EndsWith("/") ? Path + Name : Path + "/" + Name;
            return $"{Tenant}/{Subproject}{datasetPath}";
        }
    }

    /// <summary>
    /// Gets the full SD path (sd://tenant/subproject/path/name) or falls back to Id if tenant/subproject are missing.
    /// </summary>
    [JsonIgnore]
    public string SdPath => SdPathParser.Build(Tenant, Subproject, Path, Name, Id);
}
