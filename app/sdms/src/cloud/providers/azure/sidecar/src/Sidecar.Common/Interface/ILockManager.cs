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

namespace Sidecar.DeleteOperationRunner.Services
{
    public interface ILockManager
    {
        /// <summary>
        /// Attempts to acquire a delete lock which is only possible of no read or writ lock is present.
        /// A delete lock can be acquired even though a delete lock is already present.
        /// A delete lock is similar to a write lock, the value starts with WDELETE instead of W.
        /// </summary>
        /// <param name="key">The dataset to be locked</param>
        /// <returns>`true` if the delete lock could be acquired, `false` otherwise.</returns>
        Task<bool> AcquireDeleteLock(string key);
    }
}
