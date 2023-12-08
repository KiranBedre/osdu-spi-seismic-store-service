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

namespace Sidecar.Common.Interface;

public interface IDataAccess
{
    Task<string> QueryAsync(string cs, string sql, string? ctoken, int? limit);
    Task<IPaginatedRecords> GetRecordsAsync(string cs, string sql, string? ctoken, int? limit);
    Task<bool> DeleteMetadataAsync(string cs, string id);
    Task<bool> UpdateMetadataAsync(string cs, string id, Dictionary<string, object> updates);
}
