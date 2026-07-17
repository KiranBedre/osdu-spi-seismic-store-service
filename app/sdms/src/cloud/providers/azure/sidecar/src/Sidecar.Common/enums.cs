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

namespace Sidecar.Common;

using System.ComponentModel;

public static class EnumExtensionMethods
{
    public static string Description(this Enum enumVal)
    {
        var field = enumVal.GetType().GetField(enumVal.ToString());
        if (field == null)
        {
            return enumVal.ToString();
        }

        if (Attribute.GetCustomAttribute(field, typeof(DescriptionAttribute)) is DescriptionAttribute attribute)
        {
            return attribute.Description;
        }
        return enumVal.ToString();
    }

}

public enum Status
{
    [Description("Started")]
    Started = 0,
    [Description("In Progress")]
    InProgress = 1,
    [Description("Completed")]
    Completed = 2,
    [Description("Completed With Errors")]
    CompletedWithErrors = 3
}

public enum RestoreOperationStatus
{
    InProgress = 0,
    Succeeded = 1,
    Failed = 2,
    Rejected = 3
}

/// <summary>
/// Account-level blob point-in-time restore status as reported by the Azure Storage management
/// plane (<c>properties.blobRestoreStatus.status</c>). Mirrors Azure's
/// <c>BlobRestoreProgressStatus</c>, tolerating both the ARM schema value (<c>Complete</c>) and the
/// value shown in the <c>restoreBlobRanges</c> response example (<c>Succeeded</c>) as terminal
/// success. Use <see cref="Sidecar.Common.Utility.AzureBlobRestoreStatusParser"/> to map the raw
/// API string onto these members.
/// </summary>
public enum AzureBlobRestoreStatus
{
    /// <summary>No status reported yet, or an unrecognized value.</summary>
    Unknown = 0,

    /// <summary>The restore is still running.</summary>
    InProgress = 1,

    /// <summary>The restore finished successfully ("Complete" or "Succeeded").</summary>
    Complete = 2,

    /// <summary>The restore failed terminally.</summary>
    Failed = 3
}
