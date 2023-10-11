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

import * as path from 'path';
import { Utils } from '../../../shared/utils';
import { SchemaTransformModel } from '../model';
import { AbstractSchemaManager, SchemaManagerFactory, SchemaTransformFuncManager, SchemaValidationResult } from './schema-manager';

@SchemaManagerFactory.register('segy_v1')
export class SegyManager extends AbstractSchemaManager {

   public schemaID: string = 'segy_v1';
   public schemaFilePath: string = path.resolve(__dirname, '../../../docs/schemas/segy/FileCollection.SEGY.1.0.0.json');

   public async addSchemas() {
      const resolvedSchema = await Utils.resolveJsonRefs(this.schemaFilePath);
      SegyManager.ajv.addSchema(JSON.parse(JSON.stringify(resolvedSchema)), this.schemaID);
   }

   public applySchemaTransforms(input: SchemaTransformModel): SchemaTransformModel {
      const transformerFuncID = input['transformFuncID'];
      const transformFunc = SegyManager.schemaTransformFuncMap[transformerFuncID];
      let result: SchemaTransformModel = transformFunc.value(input);

      while (result.nextTransformFuncID) {
         const nextTransformFunc = SegyManager.schemaTransformFuncMap[result.nextTransformFuncID];
         result = nextTransformFunc.value(result);
      }

      return result.data;

   }

   public validate(data: any): SchemaValidationResult {
      const validation = SegyManager.ajv.getSchema(this.schemaID);

      if (validation(data)) {
         return {
            valid: true
         };
      }

      let errorMessage = '';
      for (const error of validation.errors) {
         errorMessage = errorMessage + ' ' + error.instancePath + ' ' + error.message;
      }

      return {
         valid: false,
         err: errorMessage
      };
   }


   @SchemaTransformFuncManager.register('osdu:wks:dataset--FileCollection.SEGY:1.0.0')
   public transform_osdu_wks_dataset_FileCollection_SEGY_1_0_0(input: any): SchemaTransformModel {
      /* transform rules */
      return {
         'transformFuncID': 'osdu:wks:dataset--FileCollection.SEGY:1.0.0',
         'data': input['data'],
         //  chain a next transform function using its identifier
         nextTransformFuncID: undefined
         // 'nextTransformFuncID': 'osdu:wks:dataset--FileCollection.SEGY:1.1.0'
      };
   }

   // Chain the next data transformer
   @SchemaTransformFuncManager.register('osdu:wks:dataset--FileCollection.SEGY:1.1.0')
   public transform_osdu_wks_dataset_FileCollection_SEGY_1_1_0(input: any): SchemaTransformModel {
      input['data']['kind'] = 'osdu:wks:dataset--FileCollection.SEGY:1.1.0';
      input['data']['data-transformation-performed'] = true;
      return {
         'transformFuncID': 'osdu:wks:dataset--FileCollection.SEGY:1.1.0',
         'data': input['data'],
         'nextTransformFuncID': undefined
      };
   }

}
