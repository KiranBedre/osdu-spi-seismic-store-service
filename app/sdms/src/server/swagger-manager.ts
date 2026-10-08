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

import path from 'path';
import replaceInFile from 'replace-in-file';
import { Utils } from '../shared';

export class SwaggerManager {

    private static optionsDivClear = {
        files: 'node_modules/swagger-ui-dist/swagger-ui.css',
        from: '.swagger-ui .topbar{display:none;visibility:hidden',
        to: '.swagger-ui .topbar{'
    };

    private static optionsDivHide = {
        files: 'node_modules/swagger-ui-dist/swagger-ui.css',
        from: '.swagger-ui .topbar{',
        to: '.swagger-ui .topbar{display:none;visibility:hidden;'
    };

    public static swaggerDocument: object;

    public static async init() {

        replaceInFile.sync(this.optionsDivClear);
        replaceInFile.sync(this.optionsDivHide);

        const swaggerFilePath = path.join(__dirname, '..', 'docs', 'api', 'openapi.yaml');
        this.swaggerDocument = await Utils.resolveJsonRefs(swaggerFilePath);

    }

}