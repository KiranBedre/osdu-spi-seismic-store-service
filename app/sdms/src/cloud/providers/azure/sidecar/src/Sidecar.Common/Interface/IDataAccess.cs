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
    Task<string> QueryAsync(
        string endpoint,
        string sql,
        string? parameters,
        string? ctoken,
        int? limit);
    Task<string> QueryAsync(
        string endpoint,
        string sql,
        string? parameters,
        string? ctoken,
        int? limit,
        string? operationId);
    Task<IPaginatedRecords> GetRecordsAsync(
        string endpoint,
        string sql,
        string? parameters,
        string? ctoken,
        int? limit);
    Task<IPaginatedRecords> GetRecordsAsync(
        string endpoint,
        string sql,
        string? parameters,
        string? ctoken,
        int? limit,
        string? operationId);
    Task<bool> DeleteMetadataAsync(string endpoint, string id);
    Task<bool> DeleteMetadataAsync(string endpoint, string id, string? operationId);
    Task<bool> UpdateMetadataAsync(
        string endpoint,
        string id,
        Dictionary<string, object> updates);
    Task<bool> UpdateMetadataAsync(
        string endpoint,
        string id,
        Dictionary<string, object> updates,
        string? operationId);
}
