// ============================================================================
// Copyright 2017-2019, Schlumberger
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
import { Auth, AuthGroups } from '../../../src/auth';
import { Config } from '../../../src/cloud';
import { DESCompliance, DESEntitlement, DESUtils } from '../../../src/dataecosystem';
import { ImpTokenDAO } from '../../../src/services/imptoken';
import { IImpTokenBodyModel as ImpTokenBodyModel } from '../../../src/services/imptoken/model';
import { AppsDAO } from '../../../src/services/svcapp/dao';
import { ITenantModel } from '../../../src/services/tenant/model';
import { Tx } from '../utils';


export class TestAuth {

    public static run() {

        Config.IMP_SERVICE_ACCOUNT_SIGNER = 'signer@seistore.com';

        this.impToken = 'header.' + Buffer.from(JSON.stringify({
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER, obo: 'obo',
            rsrc: 'rsrc', rurl: 'rurl',
        })).toString('base64') + '.signature';

        this.userToken = 'header.' + Buffer.from(JSON.stringify({
            email: 'user@user.com',
        })).toString('base64') + '.signature';

        describe(Tx.testInit('authorizations'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                Config.CLOUDPROVIDER = 'google';
            });
            afterEach(() => { this.sandbox.restore(); });

            this.isUserAuthorized();
            this.isAppAuthorized();
            this.writeAccess();
            this.readAccess();
            this.usersGroup();
            this.legalTag();
            this.listUsersInGroup();

        });

    }

    private static sandbox: sinon.SinonSandbox;

    private static impToken: string;
    private static userToken: string;

    private static writeAccess() {

        Tx.sectionInit('write access');

        const tenant = {
            default_acls: undefined, esd: undefined, gcpid: undefined, name: 't' } as ITenantModel;

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').returns('esd');
            this.sandbox.stub(DESEntitlement, 'getUserGroups').resolves([{ name: 'none' }] as never);
            this.sandbox.stub(Auth, 'isNewImpersonationToken').returns(false);
            try {
                await Auth.isWriteAuthorized(this.userToken, [], tenant, 's', 'appkey', undefined);
            } catch (e) { Tx.check403(e.error.code); }
        });

        Tx.test(async () => {
            this.sandbox.stub(ImpTokenDAO, 'getImpTokenBody').returns(
                { resources: [{ resource: 't/s', readonly: false }] } as ImpTokenBodyModel);
            Tx.checkTrue(await Auth.isWriteAuthorized(this.impToken, [], tenant, 's', 'appkey', undefined));
        });

        Tx.test(async () => {
            this.sandbox.stub(ImpTokenDAO, 'getImpTokenBody').returns({ resources: [] } as ImpTokenBodyModel);
            Tx.checkFalse(await Auth.isWriteAuthorized(this.impToken, [], tenant, 's', 'appkey', undefined, false));
        });

        Tx.test(async () => {
            this.sandbox.stub(ImpTokenDAO, 'getImpTokenBody').returns(
                { resources: [{ resource: 't/s', readonly: true }] } as ImpTokenBodyModel);
            try {
                await Auth.isWriteAuthorized(this.impToken, [], tenant, 's', 'appkey', undefined);
            } catch (e) { Tx.check403(e.error.code); }
        });

        Tx.test(async () => {
            this.sandbox.stub(ImpTokenDAO, 'getImpTokenBody').returns({ resources: [] } as ImpTokenBodyModel);
            try {
                await Auth.isWriteAuthorized(this.impToken, [], tenant, 's', 'appkey', undefined);
            } catch (e) { Tx.check403(e.error.code); }
        });

    }

    private static readAccess() {

        const tenant = {
            default_acls: undefined, esd: undefined, gcpid: undefined, name: 't' } as ITenantModel;

        Tx.sectionInit('read access');

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').returns('esd');
            this.sandbox.stub(DESEntitlement, 'getUserGroups').resolves([{ name: 'none' }] as never);
            this.sandbox.stub(Auth, 'isNewImpersonationToken').returns(false);
            try {
                await Auth.isReadAuthorized(this.userToken, [], tenant, 's', 'appkey', undefined);
            } catch (e) { Tx.check403(e.error.code); }
        });

        Tx.test(async () => {
            this.sandbox.stub(ImpTokenDAO, 'getImpTokenBody').returns(
                { resources: [{ resource: 't/s', readonly: false }] } as ImpTokenBodyModel);
            Tx.checkTrue(await Auth.isReadAuthorized(this.impToken, [], tenant, 's', 'appkey', undefined));
        });

        Tx.test(async () => {
            this.sandbox.stub(ImpTokenDAO, 'getImpTokenBody').returns({ resources: [] } as ImpTokenBodyModel);
            try {
                await Auth.isReadAuthorized(this.impToken, [], tenant, 's', 'appkey', undefined);
            } catch (e) { Tx.check403(e.error.code); }
        });

        Tx.test(async () => {
            this.sandbox.stub(ImpTokenDAO, 'getImpTokenBody').returns({ resources: [] } as ImpTokenBodyModel);
            Tx.checkFalse(await Auth.isReadAuthorized(this.impToken, [], tenant, 's', 'appkey', undefined, false));
        });

    }

    private static usersGroup() {

        Tx.sectionInit('user groups');

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').returns('esd');
            this.sandbox.stub(DESEntitlement, 'getUserGroups');
            await AuthGroups.getUserGroups('t', 'esd', 'appkey');
        });
    }

    private static legalTag() {

        Tx.sectionInit('legal tag');

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').returns('esd');
            this.sandbox.stub(DESCompliance, 'isLegalTagValid').resolves(true as never);
            Tx.checkTrue(await Auth.isLegalTagValid('usertoken', 'xxx', 't', 'appkey'));
        });

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').returns('esd');
            this.sandbox.stub(DESCompliance, 'isLegalTagValid').resolves(false as never);
            try {
                await Auth.isLegalTagValid('usertoken', 'xxx', 't', 'appkey');
            } catch (e) { Tx.check404(e.error.code); }
        });

    }

    private static isUserAuthorized() {

        Tx.sectionInit('user authorizations');

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').returns('esd');
            this.sandbox.stub(DESEntitlement, 'getUserGroups').resolves([{ name: 'g' }] as never);
            this.sandbox.stub(AuthGroups, 'isMemberOfAtLeastOneGroup').resolves(true)
            Tx.checkTrue(await Auth.isUserAuthorized(this.userToken, ['g'], 'e', 'appkey'));
        });

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').returns('esd');
            this.sandbox.stub(DESEntitlement, 'getUserGroups').resolves([{ name: 'none' }] as never);
            this.sandbox.stub(AuthGroups, 'isMemberOfAtLeastOneGroup').resolves(false)
            try {
                await Auth.isUserAuthorized(this.userToken, ['t'], 'e', 'appkey');
            } catch (e) { Tx.check403(e.error.code); }
        });

    }

    private static isAppAuthorized() {

        Tx.sectionInit('apps authorizations');

        Tx.test(async () => {
            this.sandbox.stub(AppsDAO, 'get').resolves({ email: 'e', trusted: true });
            Tx.checkTrue(await Auth.isAppAuthorized({ gcpid: 'x', name: 'x', esd: 'x', default_acls: 'x' }, 'e'));
        });

        Tx.test(async () => {
            this.sandbox.stub(AppsDAO, 'get').resolves({ email: 'e', trusted: false });
            try {
                Tx.checkTrue(await Auth.isAppAuthorized(
                    { gcpid: 'x', name: 'x', esd: 'x', default_acls: 'x' }, 'e'));
            } catch (e) { Tx.check403(e.error.code); }
        });

    }

    private static listUsersInGroup() {
        Tx.sectionInit('get group users');

        Tx.test(async () => {
            this.sandbox.stub(DESUtils, 'getDataPartitionID').resolves('entitlement-tenant');
            this.sandbox.stub(DESEntitlement, 'listUsersInGroup').resolves({
                members: [
                    {
                        email: 'user@email',
                        role: 'role',
                    },
                ],
                nextCursor: undefined,
            });

            const result = await AuthGroups.listUsersInGroup(undefined, 'group-a', 'esd', 'appkey');
            Tx.checkTrue(result[0].email === 'user@email' && result[0].role === 'role');
        });
    }

}
