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

namespace Sidecar.Common.Interface;

using Sidecar.Common.Service;

public interface ILockManager
{
    /// <summary>
    /// Attempts to acquire a delete lock which is only possible if no read or write lock is present.
    /// A delete lock can be acquired even though a delete lock is already present.
    /// A delete lock is similar to a write lock, the value starts with "WDELETE" instead of "W".
    /// </summary>
    /// <param name="key">The dataset to be locked</param>
    /// <returns>`true` if the delete lock could be acquired, `false` otherwise.</returns>
    Task<bool> AcquireDeleteLockAsync(string key);

    /// <summary>
    /// Attempts to acquire a write lock "W".
    /// </summary>
    /// <param name="key">The dataset to be locked</param>
    /// <returns>`WriteLockSession` with Locked property set to `true` if the write lock could be acquired, `false` otherwise.</returns>
    Task<WriteLockSession> AcquireWriteLockAsync(string key);

    /// <summary>
    /// Attempts to remove a delete lock.
    /// </summary>
    /// <param name="key">The dataset to be unlocked</param>
    /// <returns>`true` if the delete lock could be removed, `false` otherwise.</returns>
    Task<bool> RemoveDeleteLockAsync(string key);

    /// <summary>
    /// Attempts to remove a write lock.
    /// </summary>
    /// <param name="session">Lock session to be removed.</param>
    /// <returns>`true` if the write lock could be removed, `false` otherwise.</returns>
    Task<bool> RemoveWriteLockAsync(WriteLockSession session);

    /// <summary>
    /// Converts an existing write lock into an indefinite (no-TTL) lock so it never expires.
    /// Used to fence off a dataset that was left in a potentially inconsistent state by a failed
    /// operation: the lock must be held until an operator manually recovers the dataset, so it must
    /// not silently expire via TTL. The lock value must still match the session's <c>Wid</c>.
    /// </summary>
    /// <param name="session">Lock session to make indefinite.</param>
    /// <returns>`true` if the lock's TTL was removed, `false` otherwise.</returns>
    Task<bool> MakeWriteLockIndefiniteAsync(WriteLockSession session);
}
