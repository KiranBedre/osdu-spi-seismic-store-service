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

import { Config, CredentialsFactory } from '../../cloud';
import { Error, Response, Utils } from '../../shared';
import { Request as expRequest, Response as expResponse } from 'express';
import { Context } from '../../shared/context';
import { Operation } from './operations';
import { Parser } from './parser';
import { StorageCoreService } from '../../services';

export class ConnectionsHandler {
    public static async handler(req: expRequest, res: expResponse, op: Operation) {
        if (Context.schemaEndpoint && Context.schemaEndpoint.hasBulks === false) {
            throw Error.make(
                Error.Status.BAD_REQUEST,
                'Connection strings cannot be released for ' + Context.schemaEndpoint.kind
            );
        }
        const dataPartition = req.headers[Config.DATA_PARTITION_ID] as string;
        try {
            if (op === Operation.GetUploadConnectionString) {
                Response.writeOK(res, await this.getConnectionString(req, dataPartition, false));
            } else if (op === Operation.GetDownloadConnectionString) {
                Response.writeOK(res, await this.getConnectionString(req, dataPartition, true));
            }
        } catch (error) {
            console.log(error);
            Response.writeError(res, error);
        }
    }

    private static async getConnectionString(req: expRequest, dataPartition: string, readonly: boolean) {
        const recordId = Parser.getParamRecordId(req);
        const recordVersion = Parser.getParamRecordVersion(req);

        // ensure the record exist (this will enforce dynamic policy check)
        const record = await StorageCoreService.getRecord(
            req.headers.authorization,
            recordId,
            dataPartition,
            recordVersion
        );

        // for upload connection strings only
        if (!readonly) {
            // ensure the user is owner by trying upsert an entry (skip-dupes-applies)
            await StorageCoreService.insertRecords(req.headers.authorization, [record], dataPartition, true);
        }

        const bucketId = Utils.constructBucketID(recordId);
        const storageCredentials = await CredentialsFactory.build(Config.CLOUD_PROVIDER, {
            dataPartition,
        }).getStorageCredentials(bucketId, readonly, dataPartition);
        return storageCredentials;
    }
}
