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

namespace Sidecar.ComputeSizeRunner;

using Microsoft.Extensions.Logging;

public class DatasetWriteLockManager : IDatasetWriteLockManager
{
    private const int LOCK_ATTEMPTS = 5;
    private readonly ILockManager _lockManager;
    private readonly ILogger<DatasetWriteLockManager> _logger;

    public DatasetWriteLockManager(ILockManager lockManager, ILogger<DatasetWriteLockManager> logger)
    {
        _lockManager = lockManager;
        _logger = logger;
    }

    public async Task<WriteLockSession> LockDataset(string datasetLockKey)
    {
        _logger.LogDebug("Acquiring lock for {n}", datasetLockKey);
        var attempt = 0;
        var writeLockSession = new WriteLockSession();

        while (!writeLockSession.Locked && attempt < LOCK_ATTEMPTS)
        {
            writeLockSession = await _lockManager.AcquireWriteLockAsync(datasetLockKey);
            if (!writeLockSession.Locked)
            {
                _logger.LogError("Could not acquire lock for {n} (Attempt {attempt})", datasetLockKey, attempt + 1);
                await Task.Delay(100);
            }
            attempt++;
        }
        return writeLockSession;
    }

    public async Task ReleaseLock(string datasetLockKey, WriteLockSession writeLockSession)
    {
        if (!writeLockSession.Locked)
        {
            _logger.LogDebug("Dataset with lock key {n} is not locked. Can't remove the lock.", datasetLockKey);
            return;
        }
        _logger.LogDebug("Removing lock for {n}", datasetLockKey);
        var attempt = 0;
        var unlocked = false;

        while (!unlocked && attempt < LOCK_ATTEMPTS)
        {
            unlocked = await _lockManager.RemoveWriteLockAsync(writeLockSession);
            if (!unlocked)
            {
                _logger.LogError("Could not remove lock for {n} (Attempt {attempt})", datasetLockKey, attempt + 1);
                await Task.Delay(100);
            }
            attempt++;
        }
    }
}
