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

import { Config, StorageFactory } from '../../cloud';
import { Response, Utils } from '../../shared';
import { Request as expRequest, Response as expResponse } from 'express';
import { Context } from '../../shared/context';
import { Operation } from './operations';
import { Parser } from './parser';
import { SearchService } from '../../services/search';
import { StorageCoreService } from '../../services';

export class SchemaHandler {
    public static async handler(req: expRequest, res: expResponse, op: Operation) {
        const dataPartition = req.headers[Config.DATA_PARTITION_ID] as string;
        try {
            if (op === Operation.RegisterPatch) {
                Response.writeOK(res, await this.register(req, dataPartition));
            } else if (op === Operation.Get) {
                Response.writeOK(res, await this.get(req, dataPartition));
            } else if (op === Operation.GetVersionedSchema) {
                Response.writeOK(res, await this.getVersion(req, dataPartition));
            } else if (op === Operation.DeleteSchema) {
                Response.writeOK(res, await this.delete(req, dataPartition));
            } else if (op === Operation.GetAllVersionIDsOfSchema) {
                Response.writeOK(res, await this.getAllVersionIDs(req, dataPartition));
            } else if (op === Operation.ListSchemas) {
                Response.writeOK(res, await this.listSchemas(req, dataPartition));
            }
        } catch (error) {
            console.log(error);
            Response.writeError(res, error);
        }
    }

    /**
     * Register a Schema with storage service
     * @param req
     * @param dataPartition
     * @returns list of storage service record identifiers
     */
    private static async register(req: expRequest, dataPartition: string): Promise<string[]> {
        const records = await Parser.register(req, dataPartition);
        const recordIds = await StorageCoreService.insertRecords(req.headers.authorization!, records, dataPartition);
        if (Context.schemaEndpoint.hasBulks) {
            for (let ii = 0; ii < records.length; ii++) {
                const bucketId = Utils.constructBucketID(recordIds[ii].substring(0, recordIds[ii].lastIndexOf(':')));
                if (!(await StorageFactory.build(Config.CLOUD_PROVIDER, { dataPartition }).bucketExists(bucketId))) {
                    await StorageFactory.build(Config.CLOUD_PROVIDER, { dataPartition }).createBucket(bucketId);
                }
            }
        }
        return recordIds;
    }

    /**
     * Get a Schema storage record
     * @param req
     * @param dataPartition
     * @returns Schema storage record
     */
    private static async get(req: expRequest, dataPartition: string) {
        const recordId = Parser.get(req);
        return await StorageCoreService.getRecord(req.headers.authorization, recordId, dataPartition);
    }

    /**
     * Get a version of a Schema storage record
     * @param req
     * @param dataPartition
     * @returns Schema storage record
     */
    private static async getVersion(req: expRequest, dataPartition: string) {
        const [recordId, version] = Parser.getVersion(req);
        return await StorageCoreService.getRecord(req.headers.authorization, recordId, dataPartition, version);
    }

    /**
     * Delete a Schema storage record and associated cloud storage container
     * @param req
     * @param dataPartition
     */
    private static async delete(req: expRequest, dataPartition: string) {
        const inputRecordID = Parser.get(req);

        try {
            await StorageCoreService.deleteRecord(req.headers.authorization, inputRecordID, dataPartition);
        } catch (error) {
            if (error?.error?.code !== 404) {
                throw error;
            }
        }
        if (Context.schemaEndpoint.hasBulks) {
            const bucketID = Utils.constructBucketID(inputRecordID);
            await StorageFactory.build(Config.CLOUD_PROVIDER, { dataPartition }).deleteBucket(bucketID);
        }
    }

    /**
     * Get all the version identifiers of a storage record
     * @param req
     * @param dataPartition
     * @returns array of version identifiers for a storage record
     */
    private static async getAllVersionIDs(req: expRequest, dataPartition: string) {
        const recordId = Parser.get(req);
        return await StorageCoreService.getAllVersions(req.headers.authorization, recordId, dataPartition);
    }

    /**
     * Lists the Schemas in a data partition using the search service
     * @param req
     * @param dataPartition
     * @returns list of Schema storage records that match the Schema kind
     */
    private static async listSchemas(req: expRequest, dataPartition: string) {
        const options = await Parser.listSchemas(req, dataPartition);
        return await SearchService.searchOnKind(
            req.headers.authorization,
            dataPartition,
            options.kind,
            options.pagination
        );
    }
}
