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
/// Maps the raw account-level <c>blobRestoreStatus.status</c> string reported by the Azure Storage
/// management plane onto the <see cref="AzureBlobRestoreStatus"/> enum. Centralizes the only place
/// the Azure status literals appear so consumers reason over the enum instead of hardcoded strings.
/// </summary>
public static class AzureBlobRestoreStatusParser
{
    // Raw status values as reported by the Azure Storage management plane
    // (properties.blobRestoreStatus.status). "Complete" is the ARM schema value; "Succeeded" is the
    // value shown in the restoreBlobRanges response example. Both denote terminal success.
    private const string IN_PROGRESS = "InProgress";
    private const string COMPLETE = "Complete";
    private const string SUCCEEDED = "Succeeded";
    private const string FAILED = "Failed";

    /// <summary>
    /// Parses the raw Azure status string into <see cref="AzureBlobRestoreStatus"/>. Comparison is
    /// case-insensitive; both "Complete" and "Succeeded" map to
    /// <see cref="AzureBlobRestoreStatus.Complete"/>. A null, empty, or unrecognized value maps to
    /// <see cref="AzureBlobRestoreStatus.Unknown"/>.
    /// </summary>
    public static AzureBlobRestoreStatus Parse(string? status)
    {
        if (string.Equals(status, IN_PROGRESS, StringComparison.OrdinalIgnoreCase))
        {
            return AzureBlobRestoreStatus.InProgress;
        }

        if (string.Equals(status, COMPLETE, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, SUCCEEDED, StringComparison.OrdinalIgnoreCase))
        {
            return AzureBlobRestoreStatus.Complete;
        }

        if (string.Equals(status, FAILED, StringComparison.OrdinalIgnoreCase))
        {
            return AzureBlobRestoreStatus.Failed;
        }

        return AzureBlobRestoreStatus.Unknown;
    }

    /// <summary>
    /// True when the restore is still running or has completed successfully — i.e. an adoptable
    /// restore that has not failed. Used to decide whether an account's current/in-flight restore
    /// can be resumed or adopted instead of submitting a new one.
    /// </summary>
    public static bool IsActiveOrCompleted(this AzureBlobRestoreStatus status) =>
        status is AzureBlobRestoreStatus.InProgress or AzureBlobRestoreStatus.Complete;
}
