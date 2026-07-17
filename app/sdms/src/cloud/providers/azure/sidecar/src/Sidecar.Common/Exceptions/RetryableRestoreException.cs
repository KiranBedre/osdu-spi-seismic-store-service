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
/// Signals a transient restore condition that should NOT terminate the operation.
///
/// When thrown, the orchestrator leaves the operation status as InProgress (rather than
/// marking it Failed) and rethrows, so the queue redelivers the message and the operation
/// resumes. Used for conditions such as a concurrent/in-flight PITR that cannot yet be
/// adopted, where retrying is the correct recovery.
/// </summary>
public class RetryableRestoreException : System.Exception
{
    public RetryableRestoreException(string message)
        : base(message)
    {
    }

    public RetryableRestoreException(string message, System.Exception innerException)
        : base(message, innerException)
    {
    }
}
