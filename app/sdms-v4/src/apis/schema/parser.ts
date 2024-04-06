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

import { Error, Params, Schema } from '../../shared';
import { Context } from '../../shared/context';
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
}
