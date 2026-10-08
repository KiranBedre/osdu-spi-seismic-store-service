// ============================================================================
// Copyright 2017-2024, Microsoft
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

namespace Sidecar.Common.Resilience;

public class ResilienceOptions
{
    public RetryPolicyOptions Redis { get; set; } = new()
    {
        MaxRetryAttempts = 3,
        BaseDelayMs = 100,
        MaxDelayMs = 2000,
        UseJitter = true
    };

    public RetryPolicyOptions General { get; set; } = new()
    {
        MaxRetryAttempts = 3,
        BaseDelayMs = 200,
        MaxDelayMs = 5000,
        UseJitter = true
    };
}

public class RetryPolicyOptions
{
    public int MaxRetryAttempts { get; set; } = 3;
    public int BaseDelayMs { get; set; } = 100;
    public int MaxDelayMs { get; set; } = 5000;
    public bool UseJitter { get; set; } = true;
    public TimeSpan BaseDelay => TimeSpan.FromMilliseconds(BaseDelayMs);
    public TimeSpan MaxDelay => TimeSpan.FromMilliseconds(MaxDelayMs);
}

public class CosmosDbRetryOptions
{
    public int MaxRetryAttemptsOnRateLimitedRequests { get; set; } = 5;
    public TimeSpan MaxRetryWaitTime { get; set; } = TimeSpan.FromSeconds(30);
}

public class StorageRetryOptions
{
    public int MaxRetries { get; set; } = 5;
    public TimeSpan Delay { get; set; } = TimeSpan.FromSeconds(1);
    public TimeSpan MaxDelay { get; set; } = TimeSpan.FromSeconds(30);
    public TimeSpan NetworkTimeout { get; set; } = TimeSpan.FromSeconds(100);
}
