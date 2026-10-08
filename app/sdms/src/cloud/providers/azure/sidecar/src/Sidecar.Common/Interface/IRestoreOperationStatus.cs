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

namespace Sidecar.Common.Interface;

public interface IRestoreOperationStatus : IRestoreOperationMessage
{
    string Id { get; set; }
    string? Tenant { get; set; }
    string? Subproject { get; set; }
    string StartedAt { get; set; }
    string? CompletedAt { get; set; }
    string? CreatedAt { get; set; }
    string LastUpdatedAt { get; set; }
    /// <summary>
    /// Values: "Enqueued" | "InProgress" | "Succeeded" | "Failed" | "Rejected".
    /// "Enqueued" is the initial status written by the SDMS API when the restore message is
    /// queued; the sidecar then transitions it to "InProgress" and finally to a terminal state.
    /// </summary>
    string Status { get; set; }

    /// <summary>
    /// Azure Storage PITR restore identifier for the blob-range restore, persisted so a
    /// redelivered restore message resumes the same restore rather than starting a new one.
    /// Null until blob restore has been initiated.
    /// </summary>
    string? BlobRestoreId { get; set; }
}
