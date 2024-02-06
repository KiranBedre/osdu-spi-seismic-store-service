// ============================================================================
// Copyright 2017-2024, Schlumberger
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

import axios, { AxiosRequestConfig } from 'axios';
import { Utils } from './shared/utils';
import { Config } from './shared/config';
import { expect } from 'chai';
import { Entitlement } from './entitlement';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

enum RecordRole {
    OWNER,
    VIEWER,
    NONE,
}

interface IAuthTestCase {
    name: string;
    recordRole: RecordRole;
    userId: string;
    userToken: string;
    svcstatus: number;
    readiness: number;
    register: number;
    get: number;
    list: number;
    patch: number;
    versions: number;
    getIdVersion: number;
    getUpCS: number;
    getDownCs: number;
    delete: number;
}

export class TestAuth {
    private getRequestOptions(token: string | undefined): AxiosRequestConfig {
        return {
            headers: {
                'data-partition-id': Config.partition,
                Authorization: 'Bearer ' + token,
            },
        } as AxiosRequestConfig;
    }

    private endpoint = 'generic';
    private model = 'FileCollection.Generic.1.0.0.json';
    private inputModel: any;
    private recordId: string | undefined;
    private recordVersion: string | undefined;

    public async run() {
        Config.load();

        const authTestCases = [
            {
                name: 'partition admin - record acl owner',
                recordRole: RecordRole.OWNER,
                userId: Config.pAdminUserId,
                userToken: Config.pAdminToken,
                svcstatus: 200,
                readiness: 200,
                register: 200,
                get: 200,
                list: 200,
                patch: 200,
                versions: 200,
                getIdVersion: 200,
                getUpCS: 200,
                getDownCs: 200,
                delete: 200,
            },
            {
                name: 'partition admin - record acl viewer',
                recordRole: RecordRole.VIEWER,
                userId: Config.pAdminUserId,
                userToken: Config.pAdminToken,
                svcstatus: 200,
                readiness: 200,
                register: 200,
                get: 200,
                list: 200,
                patch: 403,
                versions: 200,
                getIdVersion: 200,
                getUpCS: 403,
                getDownCs: 200,
                delete: 403,
            },
            {
                name: 'partition admin - record acl none',
                recordRole: RecordRole.NONE,
                userId: Config.pAdminUserId,
                userToken: Config.pAdminToken,
                svcstatus: 200,
                readiness: 200,
                register: 200,
                get: 403,
                list: 200,
                patch: 403,
                versions: 200,
                getIdVersion: 403,
                getUpCS: 403,
                getDownCs: 403,
                delete: 403,
            },
            {
                name: 'partition editor - record acl owner',
                recordRole: RecordRole.OWNER,
                userId: Config.pEditorUserId,
                userToken: Config.pEditorToken,
                svcstatus: 200,
                readiness: 200,
                register: 200,
                get: 200,
                list: 200,
                patch: 200,
                versions: 200,
                getIdVersion: 200,
                getUpCS: 200,
                getDownCs: 200,
                delete: 403,
            },
            {
                name: 'partition editor - record acl viewer',
                recordRole: RecordRole.VIEWER,
                userId: Config.pEditorUserId,
                userToken: Config.pEditorToken,
                svcstatus: 200,
                readiness: 200,
                register: 200,
                get: 200,
                list: 200,
                patch: 403,
                versions: 200,
                getIdVersion: 200,
                getUpCS: 403,
                getDownCs: 200,
                delete: 403,
            },
            {
                name: 'partition editor - record acl none',
                recordRole: RecordRole.NONE,
                userId: Config.pEditorUserId,
                userToken: Config.pEditorToken,
                svcstatus: 200,
                readiness: 200,
                register: 200,
                get: 403,
                list: 200,
                patch: 403,
                versions: 200,
                getIdVersion: 403,
                getUpCS: 403,
                getDownCs: 403,
                delete: 403,
            },
            {
                name: 'partition viewer - record acl owner',
                recordRole: RecordRole.OWNER,
                userId: Config.pViewerUserId,
                userToken: Config.pViewerToken,
                svcstatus: 200,
                readiness: 200,
                register: 403,
                get: 200,
                list: 200,
                patch: 403,
                versions: 200,
                getIdVersion: 200,
                getUpCS: 403,
                getDownCs: 200,
                delete: 403,
            },
            {
                name: 'partition viewer - record acl viewer',
                recordRole: RecordRole.VIEWER,
                userId: Config.pViewerUserId,
                userToken: Config.pViewerToken,
                svcstatus: 200,
                readiness: 200,
                register: 403,
                get: 200,
                list: 200,
                patch: 403,
                versions: 200,
                getIdVersion: 200,
                getUpCS: 403,
                getDownCs: 200,
                delete: 403,
            },
            {
                name: 'partition viewer - record acl none',
                recordRole: RecordRole.NONE,
                userId: Config.pViewerUserId,
                userToken: Config.pViewerToken,
                svcstatus: 200,
                readiness: 200,
                register: 403,
                get: 403,
                list: 200,
                patch: 403,
                versions: 403,
                getIdVersion: 403,
                getUpCS: 403,
                getDownCs: 403,
                delete: 403,
            },
            {
                name: 'partition no role - record acl owner',
                recordRole: RecordRole.OWNER,
                userId: Config.pNonRegUserId,
                userToken: Config.pNonRegToken,
                svcstatus: 200,
                readiness: 200,
                register: 401,
                get: 401,
                list: 401,
                patch: 401,
                versions: 401,
                getIdVersion: 401,
                getUpCS: 401,
                getDownCs: 401,
                delete: 401,
            },
            {
                name: 'partition no role - record acl viewer',
                recordRole: RecordRole.VIEWER,
                userId: Config.pNonRegUserId,
                userToken: Config.pNonRegToken,
                svcstatus: 200,
                readiness: 200,
                register: 401,
                get: 401,
                list: 401,
                patch: 401,
                versions: 401,
                getIdVersion: 401,
                getUpCS: 401,
                getDownCs: 401,
                delete: 401,
            },
            {
                name: 'partition no role - record acl none',
                recordRole: RecordRole.NONE,
                userId: Config.pNonRegUserId,
                userToken: Config.pNonRegToken,
                svcstatus: 200,
                readiness: 200,
                register: 401,
                get: 401,
                list: 401,
                patch: 401,
                versions: 401,
                getIdVersion: 401,
                getUpCS: 401,
                getDownCs: 401,
                delete: 401,
            },
        ] as IAuthTestCase[];

        this.inputModel = await require('./models/' + this.model);
        delete this.inputModel.id;
        if (Config.aclOwners) {
            this.inputModel.acl.owners = Config.aclOwners.split(',');
        }
        if (Config.aclViewers) {
            this.inputModel.acl.viewers = Config.aclViewers.split(',');
        }
        if (Config.legalTags) {
            this.inputModel.legal.legaltags = Config.legalTags.split(',');
        }
        for (const authTestCase of authTestCases) {
            this.recordId = undefined;
            this.recordVersion = undefined;
            describe('# Test ' + authTestCase.name + '\n', () => {
                before(async () => {
                    const group = this.getACLGroup(authTestCase.recordRole);
                    if (group !== undefined) {
                        await Entitlement.addUserToGroup(group, authTestCase.userId);
                        await delay(5000);
                    }
                });
                this.runCase(authTestCase);
                after(async () => {
                    await Utils.sendAxiosRequest(
                        axios.delete(
                            Config.url + '/' + this.endpoint + '/v1/record/' + this.recordId,
                            this.getRequestOptions(Config.idToken)
                        ),
                        false
                    );
                    const group = this.getACLGroup(authTestCase.recordRole);
                    if (group !== undefined) {
                        await Entitlement.removeUserFromGroup(group, authTestCase.userId);
                        await delay(5000);
                    }
                });
            });
        }
    }

    private runCase(testCase: IAuthTestCase) {
        it('service status' + ' (' + testCase.svcstatus + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(Config.url + '/status', this.getRequestOptions(testCase.userToken)),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equals(testCase.svcstatus);
        });

        it('service readiness' + ' (' + testCase.readiness + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(Config.url + '/status/readiness', this.getRequestOptions(testCase.userToken)),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equals(testCase.readiness);
        });

        it('register a new record' + ' (' + testCase.register + ')', async () => {
            let result = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1',
                    [this.inputModel],
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.register);
            if (testCase.register !== 200) {
                result = await Utils.sendAxiosRequest(
                    axios.put(
                        Config.url + '/' + this.endpoint + '/v1',
                        [this.inputModel],
                        this.getRequestOptions(Config.idToken)
                    )
                );
            }
            this.recordId = result?.data[0].substring(0, result?.data[0].lastIndexOf(':'));
            this.recordVersion = result?.data[0].substring(result?.data[0].lastIndexOf(':') + 1);
        });

        it('get record by id' + ' (' + testCase.get + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordId,
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.get);
        });

        it('list records by kind' + ' (' + testCase.list + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/list?page-limit=3',
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.list);
        });

        it('patch record by id' + ' (' + testCase.patch + ')', async () => {
            this.inputModel.id = this.recordId;
            this.inputModel.tags = { NameOfKey: 'testTag' };
            const result = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1',
                    [this.inputModel],
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.patch);
            delete this.inputModel.id;
            delete this.inputModel.tags;
        });

        it('list record versions by id' + ' (' + testCase.versions + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordId + '/versions',
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.versions);
        });

        it('get record by id and version' + ' (' + testCase.getIdVersion + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordId + '/version/' + this.recordVersion,
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.getIdVersion);
        });

        it('get upload connection string' + ' (' + testCase.getUpCS + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/connection-string/upload/record/' + this.recordId,
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.getUpCS);
        });

        it('get download connection string' + ' (' + testCase.getDownCs + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/connection-string/download/record/' + this.recordId,
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.getDownCs);
        });

        it('delete record by id' + ' (' + testCase.delete + ')', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.delete(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordId,
                    this.getRequestOptions(testCase.userToken)
                ),
                false
            );
            expect(result?.status ? result.status : result?.response?.status).to.be.equal(testCase.delete);
        });
    }

    private getACLGroup(role: RecordRole) {
        return role === RecordRole.OWNER
            ? Config.aclOwners
            : role === RecordRole.VIEWER
            ? Config.aclViewers
            : undefined;
    }
}
