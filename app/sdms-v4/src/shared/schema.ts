// ============================================================================
// Copyright 2017-2023, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { Config } from '../cloud';
import { SchemaCoreService } from '../services/schema';
import { Validator } from 'jsonschema';

Validator.prototype.customFormats.integer = (x: number) => {
    return x >= Number.MIN_VALUE && x <= Number.MAX_VALUE;
};

export interface SchemaValidationResult {
    valid: boolean;
    error: string;
}

export class Schema {
    public static async getSchemaKind(
        userToken: string,
        dataPartition: string,
        referenceSchema: string
    ): Promise<string> {
        return (await SchemaCoreService.getSchema(userToken, dataPartition, referenceSchema))['x-osdu-schema-source'];
    }

    public static async validate(
        data: any,
        userToken: string,
        dataPartition: string,
        referenceSchema: string
    ): Promise<SchemaValidationResult> {
        const schema = await SchemaCoreService.getSchema(userToken, dataPartition, referenceSchema);
        const validator = new Validator();
        const valid = validator.validate(
            data,
            schema,
            Config.ENABLE_SCHEMA_PROPERTIES_FORMAT_VALIDATION ? {} : { skipAttributes: ['format'] }
        ).valid;
        return {
            valid,
            error: valid
                ? undefined
                : validator.validate(data, schema).errors[0].property +
                  ' ' +
                  validator.validate(data, schema).errors[1],
        };
    }
}
