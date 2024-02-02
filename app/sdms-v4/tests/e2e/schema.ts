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

import axios, { AxiosRequestConfig } from 'axios';
import { Config } from './shared/config';
import { Utils } from './shared/utils';
import { expect } from 'chai';

export interface TestSchemaArgs {
    endpoint: string;
    tag: string;
    model: string;
    hasBulk?: boolean;
}

interface ConnectionString {
    access_token: string;
    expires_in: string;
    token_type: string;
}

enum RequestOptionsMode {
    GENERIC,
    NO_DATA_PARTITION,
    FAKE_DATA_PARTITION,
}

export class TestSchema {
    private model: string;
    private tag: string;
    private endpoint: string;
    private hasBulk?: boolean;
    private recordsNumber = 1;
    private recordsId: string[];
    private recordsVersion: string[];
    private recordPatchedVersion: string;
    private inputModel: any;
    private uploadBulkCS: ConnectionString;
    private downloadBulkCS: ConnectionString;
    private bulkData: string;
    private bulkDataName = 'sdms-e2e-test-data';

    private getRequestOptions(mode = RequestOptionsMode.GENERIC): AxiosRequestConfig {
        const options = {
            headers: {
                'data-partition-id': Config.partition,
                Authorization: 'Bearer ' + Config.idToken,
            },
        };

        if (mode === RequestOptionsMode.NO_DATA_PARTITION) {
            delete options.headers['data-partition-id'];
        } else if (mode === RequestOptionsMode.FAKE_DATA_PARTITION) {
            options.headers['data-partition-id'] = options.headers['data-partition-id'] + '-fake';
        }

        return options as AxiosRequestConfig;
    }

    public async run(args: TestSchemaArgs) {
        this.model = args.model;
        this.tag = args.tag;
        this.endpoint = args.endpoint;
        this.hasBulk = args.hasBulk;
        this.recordsId = new Array(this.recordsNumber).fill('');
        this.recordsVersion = new Array(this.recordsNumber).fill('');

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

        describe('# Test ' + this.model + ' endpoints\n', () => {
            this.register();
            // this.getById();
            // this.list();
            this.patch();
            // this.listVersions();
            // this.getByIdAndVersion();
            // if (this.hasBulk) {
            //     this.uploadConnectionString();
            //     this.downloadConnectionString();
            //     this.bulkData = Utils.generateRandomData(1024);
            //     this.upload();
            //     this.download();
            // }
            // this.delete();
            // if (this.hasBulk) {
            //     this.download(false);
            // }
        });
    }

    private register() {
        const title = `register ${this.recordsNumber} new ${this.tag} dataset`;
        it(title, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1',
                    new Array(this.recordsNumber).fill(this.inputModel),
                    this.getRequestOptions()
                )
            );
            expect(results?.status).to.be.equal(200);
            expect(results?.data.length).to.be.equals(this.recordsNumber);
            for (let i = 0; i < this.recordsNumber; i++) {
                this.recordsId[i] = results?.data[i].substring(0, results?.data[i].lastIndexOf(':'));
                this.recordsVersion[i] = results?.data[i].substring(results?.data[i].lastIndexOf(':') + 1);
            }
        });

        it(`${title} - negative 1 - no data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1',
                    new Array(this.recordsNumber).fill(this.inputModel),
                    this.getRequestOptions(RequestOptionsMode.NO_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(400);
        });

        it(`${title} - negative 2 - fake data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1',
                    new Array(this.recordsNumber).fill(this.inputModel),
                    this.getRequestOptions(RequestOptionsMode.FAKE_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(403);
        });

        it(`${title} - negative 3 - wrong body format`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(Config.url + '/' + this.endpoint + '/v1', this.inputModel, this.getRequestOptions()),
                false
            );
            expect(results?.response?.status).to.be.equal(400);
        });

        it(`${title} - negative 4 - without a kind in the request model`, async () => {
            const tmp = this.inputModel['kind'];
            delete this.inputModel['kind'];
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1',
                    new Array(this.recordsNumber).fill(this.inputModel),
                    this.getRequestOptions()
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(500);
            this.inputModel['kind'] = tmp;
        });

        it(`${title} - negative 5 - invalid kind in the request model`, async () => {
            const tmp = this.inputModel['kind'];
            this.inputModel['kind'] = this.inputModel['kind'] + '-fake';
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1',
                    new Array(this.recordsNumber).fill(this.inputModel),
                    this.getRequestOptions()
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
            this.inputModel['kind'] = tmp;
        });
    }

    private getById() {
        const title = `get ${this.recordsNumber} newly created ${this.tag} dataset by record-id`;
        it(title, async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    this.getRequestOptions()
                )
            );
            expect(result?.status).to.be.equal(200);
            expect(result.data.kind).to.be.equals(this.inputModel.kind);
            expect(result.data.version).to.be.equals(+this.recordsVersion[0]);
            expect(result.data.id).to.be.equals(this.recordsId[0]);
        });
        it(`${title} - negative 1 - no data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    this.getRequestOptions(RequestOptionsMode.NO_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(400);
        });
        it(`${title} - negative 2 - fake data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    this.getRequestOptions(RequestOptionsMode.FAKE_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(403);
        });
        it(`${title} - negative 3 - no record id`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.get(Config.url + '/' + this.endpoint + '/v1/record/', this.getRequestOptions()),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
        });
        it(`${title} - negative 4 - invalid record id`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0] + '-fake',
                    this.getRequestOptions()
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
        });
    }

    private list() {
        const title = `list ${this.recordsNumber} ${this.tag} datasets`;
        it(title, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/list?page-limit=' + this.recordsNumber,
                    this.getRequestOptions()
                )
            );
            expect(results?.status).to.be.equal(200);
            expect(results.data.results.length).to.be.greaterThanOrEqual(0);
            const dataPartialKind = this.inputModel.kind.substring(0, this.inputModel.kind.lastIndexOf(':'));
            for (const result of results.data.results) {
                expect(result.kind.substring(0, result.kind.lastIndexOf(':'))).to.be.equals(dataPartialKind);
            }
            // once the conversion between model has been implemented, replace the above code with the below
            // for (const result of results) {
            //     expect(result.kind).to.be.equals(this.inputModel.kind);
            // }
        });
        it(`${title} - negative 1 - no data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/list?page-limit=' + this.recordsNumber,
                    this.getRequestOptions(RequestOptionsMode.NO_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(400);
        });
        it(`${title} - negative 2 - fake data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/list?page-limit=' + this.recordsNumber,
                    this.getRequestOptions(RequestOptionsMode.FAKE_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(401);
        });
    }

    private patch() {
        const title = `patch a ${this.tag} dataset by adding a custom tag`;
        it(title, async () => {
            // patch the dataset
            this.inputModel.id = this.recordsId[0];
            this.inputModel.tags = { NameOfKey: 'testTag' };
            const results = await Utils.sendAxiosRequest(
                axios.put(Config.url + '/' + this.endpoint + '/v1', [this.inputModel], this.getRequestOptions())
            );
            expect(results?.status).to.be.equal(200);
            expect(results?.data.length).to.be.equals(1);
            const id = results.data[0].substring(0, results.data[0].lastIndexOf(':'));
            expect(id).to.be.equals(this.recordsId[0]);
            this.recordPatchedVersion = results.data[0].substring(results.data[0].lastIndexOf(':') + 1);
            expect(this.recordPatchedVersion).to.be.not.equals(this.recordsVersion[0]);
            // retrieve the patched dataset
            const result = await Utils.sendAxiosRequest(
                axios.get(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    this.getRequestOptions()
                )
            );
            expect(result?.status).to.be.equal(200);
            expect(result.data.id).to.be.equals(this.recordsId[0]);
            expect(result.data.version).to.be.equals(+this.recordPatchedVersion);
            expect(result.data.tags['NameOfKey']).to.be.equals('testTag');
            delete this.inputModel.id;
            delete this.inputModel.tags;
        });

        it(`${title} - negative 1 - no data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    [this.inputModel],
                    this.getRequestOptions(RequestOptionsMode.NO_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(400);
        });

        it(`${title} - negative 2 - fake data partition`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    [this.inputModel],
                    this.getRequestOptions(RequestOptionsMode.FAKE_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
        });

        it(`${title} - negative 3 - no record id`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1/record/',
                    [this.inputModel],
                    this.getRequestOptions(RequestOptionsMode.FAKE_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
        });
        it(`${title} - negative 4 - invalid record id`, async () => {
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0] + '-fake',
                    [this.inputModel],
                    this.getRequestOptions(RequestOptionsMode.FAKE_DATA_PARTITION)
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
        });
        it(`${title} - negative 5 - without kind in model`, async () => {
            const tmp = this.inputModel['kind'];
            delete this.inputModel['kind'];
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    [this.inputModel],
                    this.getRequestOptions()
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
            this.inputModel['kind'] = tmp;
        });
        it(`${title} - negative 6 - invalid kind in model`, async () => {
            const tmp = this.inputModel['kind'];
            this.inputModel['kind'] = this.inputModel['kind'] + '-fake';
            const results = await Utils.sendAxiosRequest(
                axios.put(
                    Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0],
                    [this.inputModel],
                    this.getRequestOptions()
                ),
                false
            );
            expect(results?.response?.status).to.be.equal(404);
            this.inputModel['kind'] = tmp;
        });
    }

    // private listVersions() {
    //     it('list all versions of a ' + this.tag + ' dataset by record-id ', async () => {
    //         const results = await Utils.sendAxiosRequest(
    //             axios.get(
    //                 Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[0] + '/versions',
    //                 this.getRequestOptions()
    //             )
    //         );
    //         expect(results.length).to.be.equals(2);
    //         expect(results[0]).to.be.equals(parseInt(this.recordsVersion[0]));
    //         expect(results[1]).to.be.equals(parseInt(this.recordPatchedVersion));
    //     });
    // }

    // private getByIdAndVersion() {
    //     it('get a ' + this.tag + ' dataset by record-id and version', async () => {
    //         const result = await Utils.sendAxiosRequest(
    //             axios.get(
    //                 Config.url +
    //                     '/' +
    //                     this.endpoint +
    //                     '/v1/record/' +
    //                     this.recordsId[0] +
    //                     '/version/' +
    //                     this.recordPatchedVersion,
    //                 this.getRequestOptions()
    //             )
    //         );
    //         expect(result.kind).to.be.equals(this.inputModel.kind);
    //         expect(result.version).to.be.equals(+this.recordPatchedVersion);
    //         expect(result.id).to.be.equals(this.recordsId[0]);
    //     });
    // }

    // private delete() {
    //     it('delete ' + this.recordsNumber + ' ' + this.tag + ' dataset by record id', async () => {
    //         for (let i = 0; i < this.recordsNumber; i++) {
    //             await Utils.sendAxiosRequest(
    //                 axios.delete(
    //                     Config.url + '/' + this.endpoint + '/v1/record/' + this.recordsId[i],
    //                     this.getRequestOptions()
    //                 )
    //             );
    //         }
    //     });
    // }

    // private uploadConnectionString() {
    //     it('generate connection strings to upload bulks', async () => {
    //         const record = this.recordsId[0];
    //         this.uploadBulkCS = await Utils.sendAxiosRequest(
    //             axios.get(Config.url + '/connection-string/upload/record/' + record, this.getRequestOptions())
    //         );
    //         expect(this.uploadBulkCS.access_token).to.not.be.undefined;
    //         expect(this.uploadBulkCS.expires_in).to.not.be.undefined;
    //         expect(this.uploadBulkCS.expires_in).to.be.greaterThan(0);
    //         expect(this.uploadBulkCS.token_type).to.not.be.undefined;
    //     });
    // }

    // private downloadConnectionString() {
    //     it('generate connection strings to download bulks', async () => {
    //         const record = this.recordsId[0];
    //         this.downloadBulkCS = await Utils.sendAxiosRequest(
    //             axios.get(Config.url + '/connection-string/download/record/' + record, this.getRequestOptions())
    //         );
    //         expect(this.downloadBulkCS.access_token).to.not.be.undefined;
    //         expect(this.downloadBulkCS.expires_in).to.not.be.undefined;
    //         expect(this.downloadBulkCS.expires_in).to.be.greaterThan(0);
    //         expect(this.downloadBulkCS.token_type).to.not.be.undefined;
    //     });
    // }

    // private upload() {
    //     it('upload test data', async () => {
    //         const provider = (await axios.get(Config.url + '/status', this.getRequestOptions())).headers[
    //             'service-provider'
    //         ];
    //         if (provider === 'azure') {
    //             await axios.put(
    //                 this.uploadBulkCS.access_token.replace('?', '/' + this.bulkDataName + '?'),
    //                 this.bulkData,
    //                 {
    //                     headers: {
    //                         'x-ms-blob-type': 'BlockBlob',
    //                         'Content-Type': 'text/plain',
    //                     },
    //                 }
    //             );
    //             try {
    //                 await axios.put(
    //                     this.downloadBulkCS.access_token.replace('?', '/' + this.bulkDataName + '?'),
    //                     this.bulkData,
    //                     {
    //                         headers: {
    //                             'x-ms-blob-type': 'BlockBlob',
    //                             'Content-Type': 'text/plain',
    //                         },
    //                     }
    //                 );
    //             } catch (error) {
    //                 expect(error?.response?.status).to.be.equal(403);
    //             }
    //         } else {
    //             console.error('### The "upload" bulk test has not been implemented for "' + provider + '"');
    //         }
    //     });
    // }

    // private download(exist = true) {
    //     it('download test data', async () => {
    //         const provider = (await axios.get(Config.url + '/status', this.getRequestOptions())).headers[
    //             'service-provider'
    //         ];
    //         if (provider === 'azure') {
    //             if (exist) {
    //                 expect(
    //                     (await axios.get(this.downloadBulkCS.access_token.replace('?', '/' + this.bulkDataName + '?')))
    //                         .data
    //                 ).to.be.equals(this.bulkData);
    //                 expect(
    //                     (await axios.get(this.downloadBulkCS.access_token.replace('?', '/' + this.bulkDataName + '?')))
    //                         .data
    //                 ).to.be.equals(this.bulkData);
    //             } else {
    //                 try {
    //                     await axios.get(this.uploadBulkCS.access_token.replace('?', '/' + this.bulkDataName + '?'));
    //                 } catch (error) {
    //                     expect(error?.response?.status).to.be.equal(404);
    //                 }
    //                 try {
    //                     await axios.get(this.downloadBulkCS.access_token.replace('?', '/' + this.bulkDataName + '?'));
    //                 } catch (error) {
    //                     expect(error?.response?.status).to.be.equal(404);
    //                 }
    //             }
    //         } else {
    //             console.error('### The "download" bulk test has not been implemented for "' + provider + '"');
    //         }
    //     });
    // }
}
