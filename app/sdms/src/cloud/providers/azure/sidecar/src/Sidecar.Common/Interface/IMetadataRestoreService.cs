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

namespace Sidecar.Common.Interface;

/// <summary>
/// Restores the Cosmos metadata document to a target point-in-time.
/// </summary>
public interface IMetadataRestoreService
{
    /// <summary>
    /// Finalizes the restore by applying metadata restore to target point-in-time.
    /// Called after blob restore completes, so storage is ready when metadata becomes active.
    /// </summary>
    /// <param name="sdPath">The full SD dataset path to restore.</param>
    /// <param name="restorePointInTime">ISO-8601 target restore timestamp.</param>
    /// <param name="operationId">Correlation ID for idempotency and logging.</param>
    /// <param name="ct">Cancellation token.</param>
    Task FinalizeRestoreAsync(string sdPath, string restorePointInTime, string operationId, CancellationToken ct);
}
