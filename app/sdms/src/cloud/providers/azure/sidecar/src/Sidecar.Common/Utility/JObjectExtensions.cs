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

namespace Sidecar.Common.Utility;

using Newtonsoft.Json.Linq;

/// <summary>
/// Helpers for working with Cosmos documents represented as <see cref="JObject"/>.
/// </summary>
public static class JObjectExtensions
{
    /// <summary>
    /// Returns a copy of the document with Cosmos system properties (keys prefixed '_') removed,
    /// so the result mirrors the { id, data } shape and can be safely re-written or archived.
    /// </summary>
    public static JObject StripSystemProperties(this JObject document)
    {
        var clone = (JObject)document.DeepClone();
        foreach (var property in clone.Properties().Where(p => p.Name.StartsWith('_')).ToList())
        {
            property.Remove();
        }

        return clone;
    }
}
