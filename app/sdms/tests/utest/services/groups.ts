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

import { Request as expRequest, Response as expResponse } from 'express';
import { GeneralHandler } from '../../../src/services/general/handler';
import { SubprojectGroups } from '../../../src/services/subproject/groups';
import { GeneralOP } from '../../../src/services/general/optype';

import { Response } from '../../../src/shared';
import { Tx } from '../utils';

export class Testgroups {

    public static sinon: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit('general', true), () => {

            beforeEach(() => {  
                this.sinon = sinon.createSandbox();
            });

            afterEach(() => { 
                this.sinon.restore(); 
            });

            this.serviceAdminGroup();
            this.serviceEditorGroup();
            this.serviceViewerGroup();
        });

    }

    private static serviceAdminGroup() {

        Tx.sectionInit('service Admin Group');

        Tx.test(async () => {
            const result = SubprojectGroups.serviceAdminGroup('tenant-a', 'subproject-a', 'esd-a');
            Tx.checkTrue(result === 'service.seistore.undefined.tenant-a.subproject-a.admin@esd-a');
        });

    }

    private static serviceEditorGroup() {

        Tx.sectionInit('service Editor Group');

        Tx.test(async () => {
            const result = SubprojectGroups.serviceEditorGroup('tenant-a', 'subproject-a', 'esd-a');
            Tx.checkTrue(result === 'service.seistore.undefined.tenant-a.subproject-a.editor@esd-a');
        });

    }

    private static serviceViewerGroup() {

        Tx.sectionInit('service Editor Group');

        Tx.test(async () => {
            const result = SubprojectGroups.serviceViewerGroup('tenant-a', 'subproject-a', 'esd-a');
            Tx.checkTrue(result === 'service.seistore.undefined.tenant-a.subproject-a.viewer@esd-a');
        });

    }
}

export class TestGeneralHandler {

    public static sinon: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit('general', true), () => {

            beforeEach(() => {  
                this.sinon = sinon.createSandbox();
            });

            afterEach(() => { 
                this.sinon.restore(); 
            });

            this.testHandler();
        });

    }

    private static testHandler() {

        Tx.sectionInit('service Admin Group');

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: GeneralOP) => {
            op = GeneralOP.Readiness;
            const result = GeneralHandler.handler(req, res, op);

            // Tx.checkTrue(result === 'service.seistore.undefined.tenant-a.subproject-a.admin@esd-a');
        });
    }
}
