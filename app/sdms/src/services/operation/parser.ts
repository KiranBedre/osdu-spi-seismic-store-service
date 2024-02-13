// ============================================================================
// Copyright 2017-2024, Schlumberger
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

import { Request as expRequest } from 'express';
import { Error, Params, SDPath } from '../../shared';
import { IBulkDeleteRequest } from '../dataset/model';
import { Config } from '../../cloud';
import { DatasetFilterParser } from '../dataset/filter-parser';
import { IOperationStatusRequest } from './model';

export class Parser {

    public static bulkDelete(req: expRequest): IBulkDeleteRequest {
        Params.checkString(req.query.path, 'path');

        const fullPath = !(req.query.path as string).endsWith('/');

        const input = {
            sdPath: SDPath.getFromString(req.query.path as string, fullPath)
        } as IBulkDeleteRequest;

        this.checkFilter(req, input);

        return input;
    }

    public static bulkDeleteStatus(req: expRequest): IOperationStatusRequest {

        const args = {
            dataPartitionId: req.headers['data-partition-id'] as string,
            operationId: req.params.operationid
        } as IOperationStatusRequest

        this.checkDataPartitionId(args);

        return args;
    }

    private static checkFilter(req: expRequest, input: any) {
        if (req.body.filter) {
            if(!Config.ENABLE_ADVANCED_QUERY_FILTERS) {
                throw (Error.make(Error.Status.NOT_IMPLEMENTED,
                    'The \'filter\' parameter is not supported in ' + Config.CLOUDPROVIDER + ' implementation.'));
            }
            try {
                input.filter = DatasetFilterParser.parseFilter(req.body.filter);
            } catch (error) {
                throw (Error.make(Error.Status.BAD_REQUEST, error.message));
            }
        }
    }

    private static checkDataPartitionId(args: IOperationStatusRequest) {
        if(!args.dataPartitionId) {
            throw (Error.make(
                Error.Status.BAD_REQUEST, 'The \'data-partition-id\' header key has not been specified.'));
        }
    }

}
