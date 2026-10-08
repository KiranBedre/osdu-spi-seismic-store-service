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

namespace Sidecar.Common.Exceptions;

/// <summary>
/// Signals a TERMINAL blob-restore failure reported by Azure (blobRestoreStatus = "Failed").
///
/// Unlike <see cref="RetryableRestoreException"/>, this condition will not be resolved by
/// redelivering the message: the same restore parameters (time-to-restore, blob ranges) will
/// fail again. When thrown, the orchestrator marks the operation status as Failed rather than
/// leaving it InProgress for a queue-level retry.
///
/// The <see cref="System.Exception.Message"/> carried by this exception is intentionally
/// customer-safe and free of internal identifiers (restoreId, operationId, storage account,
/// subscription, or Azure-internal failure text). Internal diagnostics are logged separately
/// at the throw site for support triage.
/// </summary>
public class BlobRestoreFailedException : System.Exception
{
    public BlobRestoreFailedException(string message)
        : base(message)
    {
    }

    public BlobRestoreFailedException(string message, System.Exception innerException)
        : base(message, innerException)
    {
    }
}
