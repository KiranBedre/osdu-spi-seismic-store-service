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

import { Request as expRequest } from 'express';
import { Config } from '../../cloud';
import { Error, Params, SDPath, SDPathModel } from '../../shared';
import { DatasetModel } from '../dataset';
import { UtilityLsRequest } from './model';

export class UtilityParser {

    public static cp(req: expRequest): { sdPathFrom: SDPathModel, sdPathTo: SDPathModel, lock: boolean } {

        Params.checkString(req.query.sdpath_from, 'sdpath_from');
        Params.checkString(req.query.sdpath_to, 'sdpath_to');

        const sdPathFrom = SDPath.getFromString(req.query.sdpath_from as string);
        if (!sdPathFrom) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_from\' query parameter is not a valid seismic store path.'));
        }
        if (!sdPathFrom.dataset) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_from\' query parameter is not a valid seismic store dataset path.'));
        }

        const sdPathTo = SDPath.getFromString(req.query.sdpath_to as string);
        if (!sdPathTo) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_to\' query parameter is not a valid seismic store path.'));
        }
        if (!sdPathTo.dataset) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_to\' query parameter is not a valid seismic store dataset path.'));
        }

        if (sdPathFrom.tenant !== sdPathTo.tenant) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The datasets must be in the same tenant project.'));
        }

        const lock = req.query.lock ? (req.query.lock as string).toLowerCase() === 'true' : undefined;
        return { sdPathFrom, sdPathTo, lock };

    }

    public static ls(req: expRequest): UtilityLsRequest {

        const params = req.method === 'POST' ? req.body : req.query;

        // check input field
        Params.checkString(params?.sdpath, 'sdpath'); // required
        Params.checkString(params?.wmode, 'wmode', false); // optional
        Params.checkString(params?.limit, 'limit', false);  // optional
        Params.checkString(params?.cursor, 'cursor', false);  // optional

        // build input request params model
        const input = {
            sdPath: SDPath.getFromString(params.sdpath as string, false),
            pagination: {
                cursor: params.cursor as string,
                limit: parseInt(params.limit as string, 10)
            },
            workingMode: (params.wmode as string ||  Config.LS_MODE.ALL).toLowerCase()
        } as UtilityLsRequest;

        // check if the specified sdpath is valid
        if (!input.sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The "sdpath" request parameter is not a valid seismic store path.'));
        }

        // check if the specified working mode is valid
        if (input.workingMode !== Config.LS_MODE.ALL &&
            input.workingMode !== Config.LS_MODE.DATASETS &&
            input.workingMode !== Config.LS_MODE.DIRS) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The "wmode" request parameter must be "dirs", ' +
                    'or "datasets" or "all". The specified "' + input.workingMode + '" value is not valid'));
        }

        // ensure limit is a positive value
        if (input.pagination?.limit < 0) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The "limit" request parameter must be greater than zero.'));
        }

        // remove the pagination content if no pagination params have been specified
        if((!input.pagination?.cursor || input.pagination?.cursor === '') &&
            !input.pagination?.limit) {
                delete input.pagination;
        }

        return input

    }

    public static connectionString(req: expRequest): DatasetModel {

        Params.checkString(req.query.sdpath, 'sdpath');

        const sdPath = SDPath.getFromString(req.query.sdpath as string);

        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store resource path.'));
        }
        if (!sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter must be a subproject or a dataset resource path.'));
        }

        const dataset: DatasetModel = {} as DatasetModel;
        dataset.name = sdPath.dataset;
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path;

        return dataset;

    }

    public static gcsToken(req: expRequest): { sdPath: SDPathModel, readOnly: boolean; dataset: DatasetModel } {

        Params.checkString(req.query.sdpath, 'sdpath');

        // extract the subproject path and ensure that is at least a subproject path
        const sdPath = SDPath.getFromString(req.query.sdpath as string);
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store path.'));
        }

        if (!sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store subproject path.'));
        }

        const dataset: DatasetModel = {} as DatasetModel;
        if (sdPath.dataset) {
            this.constructDatasetModel(dataset, sdPath);
        }

        Params.checkString(req.query.readonly, 'readonly', false);
        let readOnlyStr = req.query.readonly as string;
        if (readOnlyStr) {
            readOnlyStr = readOnlyStr.toLowerCase();
            if (readOnlyStr !== 'false' && readOnlyStr !== 'true') {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The \'readonly\' query parameter is not a valid boolean value'));
            }
        }
        const readOnly = readOnlyStr ? (readOnlyStr === 'true') : true;

        return { sdPath, readOnly, dataset };
    }


    private static constructDatasetModel(dataset: DatasetModel, sdPath: SDPathModel) {
        dataset.name = sdPath.dataset;
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path;
    }

}
