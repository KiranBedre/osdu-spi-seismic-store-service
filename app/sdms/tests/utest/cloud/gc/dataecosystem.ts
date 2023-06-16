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

import {
    IDESEntitlementGroupMembersModel
} from '../../../../src/cloud/dataecosystem';
import { gc } from '../../../../src/cloud/providers';
import { Tx } from '../../utils';


export class TestDataEcoSystem {

  public static run() {

    describe(Tx.testInit('dataecosystem', true), () => {

      beforeEach(() => {
        this.sandbox = sinon.createSandbox();
        this.service = new google.GoogleDataEcosystemServices();
      });
      afterEach(() => { this.sandbox.restore(); });

      this.getUserAssociationSvcBaseUrlPath();
      this.getPolicySvcBaseUrlPath();
      this.fixGroupMembersResponse();


    });
  }

  private static sandbox: sinon.SinonSandbox;
  private static service: gc.GoogleDataEcosystemServices;

  private static getUserAssociationSvcBaseUrlPath() {
    Tx.sectionInit('service account email');

    Tx.testExp(async (done: any) => {
        const result = this.service.getUserAssociationSvcBaseUrlPath();
        Tx.checkTrue(result === 'userAssociation/v1', done);
    });

  }

  private static getPolicySvcBaseUrlPath() {
    Tx.sectionInit('service account email');

    Tx.testExp(async (done: any) => {
        const result = this.service.getPolicySvcBaseUrlPath();
        Tx.checkTrue(result === 'api/policy/v1', done);
    });

  }

  private static fixGroupMembersResponse() {
    Tx.sectionInit('service account email');

    Tx.testExp(async (done: any) => {
        let group = {} as IDESEntitlementGroupMembersModel ;
        const result = this.service.fixGroupMembersResponse(group);
        Tx.checkTrue(result === group, done);
    });

  }

}
