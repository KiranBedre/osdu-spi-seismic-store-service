// ============================================================================
// Copyright 2017-2026, Microsoft Corporation
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

/**
 * Enum for Redis client types
 */
export enum RedisClientType {
    /** Azure Managed Redis (AMR) cluster mode - port 10000 */
    Cluster = 'Cluster',
    /** Standalone Redis client - Azure Cache for Redis - port 6380 (legacy) */
    Redis = 'Redis'
}
