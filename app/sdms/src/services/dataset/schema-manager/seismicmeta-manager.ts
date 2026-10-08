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

import { SchemaTransformModel } from '..';
import { Error, Params } from '../../../shared';
import { AbstractSchemaManager, SchemaManagerFactory, SchemaValidationResult } from './schema-manager';


@SchemaManagerFactory.register('seismicmeta')
export class SeismicMetaManager extends AbstractSchemaManager {
   public schemaID: string = 'seismicmeta';
   public schemaFilePath: string = '';

   public async addSchemas() { return; }

   public applySchemaTransforms(data: SchemaTransformModel): SchemaTransformModel {
      return data;
   }

   public getDatasetSchemaKind(): string {
      throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
   }

   public getDatasetSchemaName(): string {
      throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
   }

   public validate(input: any): SchemaValidationResult {
      Params.checkString(input.kind, 'kind');
      Params.checkObject(input.data, 'data');

      if ((input.kind as string).split(':').length !== 4) {
         return {
            valid: false,
            err: 'The seismicmeta kind is in a wrong format'
         };
      }

      return {
         valid: true,
      };
   }

}