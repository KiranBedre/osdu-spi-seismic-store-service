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

import { Context, Error, Params, Schema, Utils } from '../../shared';
import { IDatasetV3, IDatasetV4 } from '../../shared/model';

import { SchemaListRequest } from './model';
import { Request as expRequest } from 'express';

export class Parser {
    public static async register(req: expRequest, dataPartition: string): Promise<object[]> {
        Params.checkBodyArray(req.body);

        for (const record of req.body) {
            const validationResult = await Schema.validate(
                record,
                req.headers.authorization,
                dataPartition,
                record.kind
            );
            if (!validationResult || !validationResult.valid) {
                throw Error.make(Error.Status.BAD_REQUEST, 'Schema validation error: ' + validationResult.error);
            }

            // check if the kind is acceptable with the current endpoint
            this.checkKinds(record.kind, Context.schemaEndpoint.kind);
        }
        return req.body;
    }

    public static get(req: expRequest): string {
        const recordId = req.params.id as string;
        // check if the id is acceptable with the current endpoint
        Parser.checkIds(recordId);
        return recordId;
    }

    public static getVersion(req: expRequest): [string, string] {
        const recordId = req.params.id as string;
        const recordVersion = req.params.version as string;
        // check if the id is acceptable with the current endpoint
        Parser.checkIds(recordId);
        return [recordId, recordVersion];
    }

    public static async listSchemas(req: expRequest, dataPartition: string): Promise<SchemaListRequest> {
        return {
            kind: await Schema.getSchemaKind(req.headers.authorization, dataPartition, Context.schemaEndpoint.kind),
            pagination: {
                paginationLimit: +req.query['page-limit'],
                paginationCursor: req.query['next-page-token'] as string,
            },
        };
    }

    public static checkKinds(recordKind: string, endpointKind: string): void {
        const recKind = this.kindParser(recordKind);
        const endKind = this.kindParser(endpointKind);
        if (recKind.kindLabel != endKind.kindLabel) {
            throw Error.make(
                Error.Status.BAD_REQUEST,
                `Schema validation error: Record kind ${recKind.kindLabel} not valid.`
            );
        }
        if (recKind.kindVersionMajor != endKind.kindVersionMajor) {
            throw Error.make(
                Error.Status.BAD_REQUEST,
                `Schema validation error: Record kind version ${recKind.kindVersionMajor}not valid.`
            );
        }
    }

    public static checkIds(recordId: string): void {
        const tmp1 = Context.schemaEndpoint.kind.split('--')[0].split(':');
        const tmp2 = Context.schemaEndpoint.kind.split('--')[1].split(':');
        const pattern = `^[\\w\\-\\.]+:${tmp1[tmp1.length - 1]}\\-\\-${tmp2[0]}:[\\w\\-\\.\\:\\%]+$`;
        if (new RegExp(pattern).test(recordId) == false) {
            throw Error.make(
                Error.Status.BAD_REQUEST,
                `Schema validation error: record id "${recordId}" 
                does not match endpoint required pattern "${pattern}".`
            );
        }
    }

    private static kindParser(kind: string): {
        kindLabel: string;
        kindVersion: string;
        kindVersionMajor: string;
        kindVersionMinor: string;
        kindVersionPatch: string;
    } {
        const kindLabel = kind.substring(0, kind.lastIndexOf(':'));
        const kindVersion = kind.substring(kind.lastIndexOf(':') + 1);
        const kindVersionMajor = kindVersion.split('.')[0];
        const kindVersionMinor = kindVersion.split('.')[1];
        const kindVersionPatch = kindVersion.split('.')[2];
        return {
            kindLabel,
            kindVersion,
            kindVersionMajor,
            kindVersionMinor,
            kindVersionPatch,
        } as {
            kindLabel: string;
            kindVersion: string;
            kindVersionMajor: string;
            kindVersionMinor: string;
            kindVersionPatch: string;
        };
    }

    public static getMessage(records, recordIds, dataPartition) {
        const messages = [];
        for (const [index, record] of records.entries()) {
            // const bucketId = Utils.constructBucketID(recordIds[index]);
            // this.getBlobCLient(dataPartition, bucketId);

            const v3_record: IDatasetV3 = {
                id: recordIds[index],
                data: {
                    name: this.getDatasetName(record),
                    tenant: dataPartition,
                    subproject: 'syncv4',
                    path: record.data.DatasetProperties.FileCollectionPath,
                    acls: {
                        admins: record.acl.owners,
                        viewers: record.acl.viewers,
                    },
                    ltag: this.getLtag(record), // isvalid?
                    created_by: record.createUser,
                    created_date: record.createTime,
                    last_modified_date: record.modifyTime,
                    gcsurl: Utils.constructBucketID(recordIds[index]),
                    ctag: Utils.generateRandomData(16),
                    readonly: false,
                    filemetadata: {
                        nobjects: 0,
                        size: 0,
                        type: '',
                        checksum: '',
                        tier_class: '',
                    }, //
                    computed_size: 0, //
                    computed_size_date: new Date().toString(),
                    seismicmeta_guid: record.id,
                },
            };
            messages.push(v3_record);
        }

        return messages;
    }

    private static getDatasetName(v4_record: IDatasetV4): string {
        if (v4_record.data.Name) {
            return v4_record.data.Name;
        } else if (v4_record.data.DatasetProperties.FileSourceInfos) {
            return v4_record.data.DatasetProperties.FileSourceInfos[0].Name;
        } else {
            return v4_record.id;
        }
    }

    private static getLtag(v4_record: IDatasetV4): string {
        for (const tag in v4_record.legal.legaltags) {
            // isValid?
            return tag;
        }

        return v4_record.legal.legaltags[0];
    }

    // private getFileMetadata(v4_record: IDatasetV4): FileMetadata {
    //     let fileMetadata: FileMetadata;

    //     const blob_list = getBlobClient(connectionString);
    //     let size = 0;
    //     let tier_class = null;
    //     let objects_num = 0;
    //     let error = false;
    //     for (const blob in blob_list) {
    //         if (blob.name !== str(count)) {
    //             error = true;
    //         }
    //         if (tier_class === null) {
    //             tier_class = blob.blob_tier;
    //         }
    //         objects_num = objects_num + 1;
    //         size = size + blob.size;
    //     }

    //     if (!error) {
    //         fileMetadata.type = 'GENERIC';
    //         fileMetadata.nobjects = objects_num;
    //         fileMetadata.size = size;
    //         if (v4_record.data.DatasetProperties) {
    //             fileMetadata.checksum = v4_record.data.DatasetProperties.Checksum;
    //         }
    //         fileMetadata.tier_class = tier_class;
    //     } else {
    //         fileMetadata = null;
    //     }

    //     return fileMetadata;
    // }

    // static async getBlobCLient(dataPartition, bucketId) {
    //     const account = await AzureSecrets.getStorageResourceSecrets(dataPartition);
    //     const blobServiceClient = new BlobServiceClient(
    //         `https://${account}.blob.core.windows.net`,
    //         AzureCredentials.getCredential()
    //     );
    //     const container = blobServiceClient.getContainerClient(bucketId);
    //     const blobs = container.listBlobsFlat();
    //     let blobItem = await blobs.next();
    //     console.log(blobItem);
    //     while (!blobItem.done) {
    //         const blob = container.getBlobClient(blobItem.value.name);
    //         console.log(blob);
    //         blobItem = await blobs.next();
    //     }
    // }
}
