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

/// <summary>
/// The tenant/subproject/path/dataset components parsed from a dataset sdPath
/// (<c>sd://&lt;tenant&gt;/&lt;subproject&gt;/&lt;path&gt;/&lt;dataset&gt;</c>). <see cref="Path"/>
/// is normalized to a leading+trailing-slash form (e.g. <c>/a/b/</c>, or <c>/</c> when empty) to
/// match how dataset documents persist <c>c.data.path</c>.
/// </summary>
public sealed record SdPathParts(string Tenant, string Subproject, string Path, string Dataset);

/// <summary>
/// Parses a dataset sdPath into its <see cref="SdPathParts"/> components. Shared by the restore
/// readers/writers so sdPath tokenization (and its validation errors) stay identical everywhere.
/// </summary>
public static class SdPathParser
{
    /// <summary>
    /// Parses <paramref name="sdPath"/> (<c>sd://&lt;tenant&gt;/&lt;subproject&gt;/&lt;path&gt;/&lt;dataset&gt;</c>)
    /// into its components. The path segment is normalized to a leading+trailing-slash form
    /// (<c>/</c> when there are no intermediate path tokens).
    /// </summary>
    /// <param name="sdPath">The dataset sdPath to parse.</param>
    /// <returns>The parsed <see cref="SdPathParts"/>.</returns>
    /// <exception cref="ArgumentException">
    /// Thrown when the sdPath is missing the <c>sd://</c> scheme or does not contain at least a
    /// tenant, subproject, and dataset segment.
    /// </exception>
    public static SdPathParts Parse(string sdPath)
    {
        if (string.IsNullOrWhiteSpace(sdPath) || !sdPath.StartsWith("sd://", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException(
                $"Invalid sdPath format: '{sdPath}'. Expected format: sd://<tenant>/<subproject>/...", nameof(sdPath));
        }

        var tokens = sdPath[5..].Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length < 3)
        {
            throw new ArgumentException(
                $"Invalid dataset sdPath format: '{sdPath}'. Expected format: sd://<tenant>/<subproject>/<path>/<dataset>.", nameof(sdPath));
        }

        var tenant = tokens[0];
        var subproject = tokens[1];
        var dataset = tokens[^1];
        var pathTokens = tokens.Skip(2).Take(tokens.Length - 3).ToArray();
        var path = pathTokens.Length == 0 ? "/" : "/" + string.Join('/', pathTokens) + "/";

        return new SdPathParts(tenant, subproject, path, dataset);
    }

    /// <summary>
    /// Builds a dataset sdPath (<c>sd://tenant/subproject/path/name</c>) from its components,
    /// shared by all writers/readers so the format stays identical. Returns
    /// <paramref name="fallback"/> when tenant, subproject, or name is missing.
    /// </summary>
    public static string Build(string? tenant, string? subproject, string? path, string? name, string fallback)
    {
        if (string.IsNullOrEmpty(tenant) || string.IsNullOrEmpty(subproject) || string.IsNullOrEmpty(name))
        {
            return fallback;
        }

        var normalizedPath = string.IsNullOrEmpty(path) ? "/" : path;
        var datasetPath = normalizedPath.EndsWith('/') ? normalizedPath + name : normalizedPath + "/" + name;
        return $"sd://{tenant}/{subproject}{datasetPath}";
    }
}
