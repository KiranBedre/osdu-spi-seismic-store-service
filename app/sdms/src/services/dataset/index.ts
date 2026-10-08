// ============================================================================
// Copyright 2017-2021, Schlumberger
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

export { DatasetAuth } from './auth';
export { DatasetDAO } from './dao';
export {
  IDatasetModel as DatasetModel,
  IPaginationModel as PaginationModel,
  IDatasetListRequest as DatasetListRequest,
  IDatasetPatchRequest as DatasetPatchRequest,
  SchemaTransformModel,
  ListDatasetsParams,
  QueryFilter,
  QueryFilterVisitor,
  AndQueryFilter,
  MatchQueryFilter,
  NotQueryFilter,
  OrQueryFilter
} from './model';
export { DatasetUtils } from './utils'

export * as Schemamanagement from './schema-manager';



