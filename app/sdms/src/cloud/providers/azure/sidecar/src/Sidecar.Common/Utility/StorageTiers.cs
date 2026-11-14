// ============================================================================
// Copyright 2017-2025, Schlumberger
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

public static class StorageTiers
{
    private static readonly string[] BaseTiers = ["Hot", "Cool", "Cold"];
    private const string SmartTier = "Smart";

    public static IReadOnlyList<string> GetSupportedTiers(bool enableSmartTier)
    {
        if (!enableSmartTier)
        {
            return BaseTiers;
        }

        return [.. BaseTiers, SmartTier];
    }

    public static string? TryGetCanonicalTier(string tier)
    {
        if (string.IsNullOrWhiteSpace(tier))
        {
            return null;
        }

        var normalized = char.ToUpperInvariant(tier[0]) + tier[1..].ToLowerInvariant();
        return GetSupportedTiers(enableSmartTier: true).Contains(normalized, StringComparer.Ordinal)
            || BaseTiers.Contains(normalized, StringComparer.Ordinal)
            ? normalized
            : null;
    }

    public static bool IsSupported(string tier, bool enableSmartTier)
    {
        var canonical = TryGetCanonicalTier(tier);
        return canonical is not null && GetSupportedTiers(enableSmartTier).Contains(canonical, StringComparer.Ordinal);
    }
}
