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
/// Signals a request-level restore rejection: the restore point cannot be honored because it is
/// out of range or a no-op (at/before creation, in a period with no live version, inside the
/// current live window where the dataset already reflects that state, or a deleted dataset with no
/// archived version covering the point).
///
/// This is NOT an operational failure. It is raised on the read side before any blob or metadata
/// mutation, so the orchestrator marks the operation Rejected (terminal), releases its locks and
/// discards the message rather than marking it Failed or retrying.
/// </summary>
public class RestoreRejectedException : System.Exception
{
    public RestoreRejectedException(string message)
        : base(message)
    {
    }

    public RestoreRejectedException(string message, System.Exception innerException)
        : base(message, innerException)
    {
    }
}
