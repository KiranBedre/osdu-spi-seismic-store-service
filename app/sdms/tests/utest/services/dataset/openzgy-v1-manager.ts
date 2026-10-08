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

import sinon from 'sinon';
import { SchemaTransformModel } from '../../../../src/services/dataset';
import { OpenZgyV1SchemaManager } from '../../../../src/services/dataset/schema-manager/openzgy-v1-manager';
import { Utils } from '../../../../src/shared';
import { Tx } from '../../utils';

export class OpenzgyTest {

    private static sandbox: sinon.SinonSandbox;
    private static manager: OpenZgyV1SchemaManager;

    public static run() {

        describe(Tx.testInit('general', true), () => {

            beforeEach(() => {  
                this.sandbox = sinon.createSandbox();
                this.manager = new OpenZgyV1SchemaManager();
            });

            afterEach(() => { 
                this.sandbox.restore(); 
            });

            this.testaddSchemas();
            this.testapplySchemaTransforms();
            this.testvalidate();

        });

    }

    private static testaddSchemas() {

        Tx.sectionInit("test add Schemas");

        Tx.test(async () => {
            this.sandbox.stub(Utils, "resolveJsonRefs").resolves();
            this.sandbox.stub(OpenZgyV1SchemaManager.ajv, "addSchema").resolves();
            
            try {
                await this.manager.addSchemas();
            } catch (e) { return; } // ignore exceptions
        });

    }

    private static testapplySchemaTransforms() {

        Tx.sectionInit("test apply Schema Transforms");

        Tx.test(async () => {
            let mymodle = {
                transformFuncID: "transformFuncID",
                data: "data",
                nextTransformFuncID: "nextTransformFuncID"
            } as SchemaTransformModel;
            
            try {
                await this.manager.applySchemaTransforms(mymodle);;
            } catch (e) { return; } // ignore exceptions
        });

    }

    private static testvalidate() {

        Tx.sectionInit("test validate");

        Tx.test(async () => {
            let mymodle = {
                transformFuncID: "transformFuncID",
                data: "data",
                nextTransformFuncID: "nextTransformFuncID"
            } as SchemaTransformModel;
            
            try {
                this.manager.validate(mymodle);;
            } catch (e) { return; } // ignore exceptions
        });

    }
}
