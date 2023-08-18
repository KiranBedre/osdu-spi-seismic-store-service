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

using StackExchange.Redis;

namespace Sidecar.Common.Model{

    public class DeleteOperationStatus : DeleteOperationMessage, IDeleteOperationStatus
    {
        public DateTime CreatedAt { get;set; } = DateTime.UtcNow;
        public DateTime LastUpdatedAt { get;set; } = DateTime.UtcNow;
        public string CreatedBy { get;set; } = "";
        public string Status { get;set; } = "";
        public string StatusDescription { get;set; } = "";
        public long DatasetsCnt { get;set; } = 0;
        public long DeletedCnt { get;set; } = 0;
        public long FailedCnt { get;set; } = 0;
    }
}