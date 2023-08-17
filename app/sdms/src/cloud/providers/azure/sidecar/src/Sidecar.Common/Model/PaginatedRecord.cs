// ============================================================================
// Copyright 2017-2023, Schlumberger
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

namespace Sidecar.Common.Model{
    public class QueryPaginatedRequestBody
    {
        public string? cs { get; set; }
        public string? sql { get; set; }
        public string? ctoken { get; set; }
        public int? limit { get; set; }
    }

    public class PaginatedRecords
    {
        public List<Object>? records { get; set; }
        public string? continuationToken { get; set; }

    }
}