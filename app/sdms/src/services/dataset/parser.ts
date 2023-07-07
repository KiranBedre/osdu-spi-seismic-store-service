// ============================================================================
// Copyright 2017-2021, Schlumberger
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
import { DatasetListRequest, DatasetModel } from '.';
import { Auth } from '../../auth';
import { Config } from '../../cloud';
import { Error, Params, Utils } from '../../shared';
import { SchemaManagerFactory } from './schema-manager';
import { ImpersonationTokenHandler } from '../impersonation_token/handler';

export class DatasetParser {

    public static checkCTag(req: expRequest): { tenantID: string, dataPartitionID: string, dataset: DatasetModel; } {

        const dataset = this.createDatasetModelFromRequest(req);

        Params.checkString(req.query.ctag, 'ctag');

        if (req.query.ctag.length < 19) { // ctag (16) + project(3 at least)
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'ctag\' query parameter is in a wrong format.'));
        }

        dataset.ctag = (req.query.ctag as string).substr(0, 16);
        const tmp = (req.query.ctag as string).substr(16) as string;
        const tenantID = tmp.split(';')[0];
        const dataPartitionID = tmp.split(';')[1];

        return { tenantID, dataPartitionID, dataset };

    }

    public static async register(req: expRequest): Promise<DatasetModel> {

        // Init the dataset model from user input parameters
        const dataset = this.createDatasetModelFromRequest(req);
        dataset.ltag = (req.headers.ltag) as string;
        dataset.type = req.body ? req.body.type : undefined;
        if (Auth.isImpersonationToken(req.headers.authorization)) {
            const context = req.get('impersonation-token-context');
            if (context === undefined) {
                dataset.created_by = req.get(Config.USER_ID_HEADER_KEY_NAME) ||
                await Utils.getUserId(req.headers.authorization);

                /* FIXME: This is a workaround to use impersonation tokens without having to provide the context.
                Should add back this "throw" code change once impersonation-Token-Context is properly enforced
                */
                // throw (Error.make(Error.Status.BAD_REQUEST,
                //     'The request impersonation-token-context header has not been specified.'));
            }
            else {
                const tokenContext = ImpersonationTokenHandler.decodeContext(context);
                dataset.created_by = tokenContext.user;
            }
        }
        else {
            dataset.created_by = req.get(Config.USER_ID_HEADER_KEY_NAME) ||
            await Utils.getUserId(req.headers.authorization);
        }

        dataset.created_date = dataset.last_modified_date = new Date().toString();
        dataset.gtags = req.body ? req.body.gtags : undefined;

        // Check the parameters
        Params.checkString(dataset.type, 'type', false);
        Params.checkString(dataset.ltag, 'ltag', false);

        DatasetParser.validateStorageSchemaRecord(req, dataset);

        dataset.acls = req.body && 'acls' in req.body ? req.body.acls : undefined;

        DatasetParser.validateAcls(dataset);

        return dataset;

    }

    private static validateAcls(dataset: DatasetModel) {

        if (dataset.acls) {

            if (!('admins' in dataset.acls) || !('viewers' in dataset.acls)) {
                throw Error.make(Error.Status.BAD_REQUEST,
                    'Admins and viewers properties are both required in the acls ');
            }

            if (dataset.acls.admins.length === 0 || dataset.acls.viewers.length === 0) {
                throw Error.make(Error.Status.BAD_REQUEST,
                    'Admins and viewers groups must each have at least one group email');
            }

            for (const adminGroupEmail of dataset.acls.admins) {
                Params.checkEmail(adminGroupEmail, 'acls.admins', true);
            }

            for (const viewerGroupEmail of dataset.acls.viewers) {
                Params.checkEmail(viewerGroupEmail, 'acls.viewers', true);
            }

        }
    }

    public static get(req: expRequest): [DatasetModel, boolean, boolean, string] {
        let userInfo = true;
        if(req.query['translate-user-info'] === 'false' || req.query['subid-to-email'] === 'false') {
            userInfo = false;
        }
        const seismicMetaRecordVersion = req.query['record-version'] ?
            req.query['record-version'] as string : undefined;
        return [this.createDatasetModelFromRequest(req),
        req.query.seismicmeta === 'true', userInfo, seismicMetaRecordVersion];

    }

    public static list(req: expRequest): DatasetListRequest {
        return req.method === 'POST' ? this.listPost(req) : this.listGet(req);
    }

    public static listGet(req: expRequest): DatasetListRequest {
        let userInfo = true;
        if(req.query['translate-user-info'] === 'false' || req.query['subid-to-email'] === 'false') {
            userInfo = false;
        }

        const input = {
            dataset: this.createDatasetModelFromRequest(req),
            pagination: null,
            userInfo: userInfo.valueOf()
        } as DatasetListRequest;

        if (req.query.gtag) {
            if (!(req.query.gtag instanceof Array)) {
                input.dataset.gtags = [req.query.gtag as string]
            } else {
                input.dataset.gtags = req.query.gtag as string[]
            }
        }

        if (req.query.limit || req.query.cursor) {
            input.pagination = {
                limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
                cursor: req.query.cursor as string
            };
        }

        if (input.pagination?.limit < 0) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'limit\' query parameter can not be less than zero.'));
        }

        if (input.pagination?.cursor === '') {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'cursor\' query parameter can not be empty if supplied'));
        }
        return input;

    }

    public static listPost(req: expRequest): DatasetListRequest {
        let userInfo = true;
        if(req.query['translate-user-info'] === 'false' || req.query['subid-to-email'] === 'false') {
            userInfo = false;
        }

        const input = {
            dataset: this.createDatasetModelFromRequest(req),
            pagination: null,
            userInfo: userInfo.valueOf()
        } as DatasetListRequest;

        if (!req.body) return input;

        Params.checkArray(req.body.gtag, 'gtag', false);
        Params.checkString(req.body.limit, 'limit', false);
        Params.checkString(req.body.cursor, 'cursor', false);

        if (req.body.gtag) {
            input.dataset.gtags = req.body.gtag;
        }

        if (req.body.limit || req.body.cursor) {
            input.pagination = { limit: +req.body.limit, cursor: req.body.cursor };
        }
        if (input.pagination?.limit < 0) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'limit\' body field cannot be less than zero.'));
        }
        if (input.pagination?.cursor === '') {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'cursor\' body field cannot be empty if supplied'));
        }

        return input;
    }

    public static delete(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static patch(req: expRequest): [DatasetModel, string, string] {

        const closeId = req.query.close as string;
        Params.checkString(closeId, 'close', false);
        Params.checkBody(req.body, closeId === undefined); // body is required only if is not a closing request

        const dataset = this.createDatasetModelFromRequest(req);

        // Patch meta data
        dataset.metadata = req.body.metadata;
        dataset.filemetadata = req.body.filemetadata;
        Params.checkObject(dataset.metadata, 'metadata', false);
        Params.checkObject(dataset.filemetadata, 'filemetadata', false);

        // Patch tags
        dataset.gtags = req.body.gtags;
        dataset.ltag = req.body.ltag;
        Params.checkArray(dataset.gtags, 'gtags', false);
        Params.checkString(dataset.ltag, 'ltag', false);

        // readonly
        Params.checkBoolean(req.body.readonly, 'readonly', false);
        dataset.readonly = req.body.readonly;

        // remove the parameter... this field should always update when patch
        dataset.last_modified_date = new Date().toString();

        // Patch newName
        const newName = req.body.dataset_new_name;
        Params.checkString(newName, 'dataset_new_name', false);

        dataset.acls = req.body && 'acls' in req.body ? req.body.acls : undefined;
        DatasetParser.validateAcls(dataset);

        DatasetParser.validateStorageSchemaRecord(req, dataset);

        return [dataset, newName, closeId];
    }

    public static lock(req: expRequest): { dataset: DatasetModel, open4write: boolean, wid: string; } {
        let openMode = req.query.openmode;
        Params.checkString(req.query.openmode, 'openmode');

        openMode = (req.query.openmode as string).toLowerCase();
        if (openMode !== 'read' && openMode !== 'write') {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'openmode\' query parameter must be \'read\' or \'write\'.'));
        }
        const open4write = openMode === 'write';

        const wid = req.query.wid as string;
        Params.checkString(req.query.wid, wid, false);

        const dataset = this.createDatasetModelFromRequest(req);

        return { dataset, open4write, wid };
    }

    public static unlock(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static exists(req: expRequest): DatasetModel[] {

        Params.checkBody(req.body);

        const datasetBody = req.body.datasets;
        Params.checkArray(datasetBody, 'datasets');

        if (datasetBody.length === 0) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'datasets\' body field is empty.'));
        }
        const datasets: DatasetModel[] = [];
        for (const item of datasetBody) {

            Params.checkString(item, 'datasets', false);
            if (item.length === 0) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The \'datasets\' body field cannot contain empty elements.'));
            }

            const dataset = this.createDatasetModelFromRequest(req);

            dataset.path = '/' + (item.lastIndexOf('/') === 0 ?
                '/' : item.substring(0, item.lastIndexOf('/') + 1)) + '/';
            while (dataset.path.indexOf('//') !== -1) { dataset.path = dataset.path.replace('//', '/'); }
            dataset.name = item.substring(item.lastIndexOf('/') + 1);
            datasets.push(dataset);

        }

        return datasets;

    }

    public static sizes(req: expRequest): DatasetModel[] {
        return this.exists(req);
    }

    public static size(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static listContent(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static checkPermissions(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static putTags(req: expRequest): DatasetModel {
        const dataset = this.createDatasetModelFromRequest(req);
        dataset.gtags = req.query.gtag as string[];
        return dataset;
    }

    private static createDatasetModelFromRequest(req: expRequest) {
        const dataset: DatasetModel = {} as DatasetModel;
        this.getSDPathFromURLParams(dataset, req);
        return dataset;
    }

    private static getSDPathFromURLParams(dataset: DatasetModel, req: expRequest) {
        dataset.name = req.params.datasetid;
        dataset.tenant = req.params.tenantid;
        dataset.subproject = req.params.subprojectid;

        const path = req.query.path ? '/' + decodeURIComponent(req.query.path as string) + '/' : '/';
        Params.checkDatasetPath(path, 'path', true);
        dataset.path = path;

        while (dataset.path.indexOf('//') !== -1) { dataset.path = dataset.path.replace('//', '/'); }
    }

    private static validateStorageSchemaRecord(req: expRequest, dataset: DatasetModel) {
        const supportedStorageRecordSchemaTypes = SchemaManagerFactory.getSupportedSchemaTypes();

        const payloadStorageRecordSchemaTypes = supportedStorageRecordSchemaTypes
            .filter(storageRecordSchema => storageRecordSchema in req.body);

        if (payloadStorageRecordSchemaTypes.length > 1) {

            const supportedSchemaTypesStr = supportedStorageRecordSchemaTypes.join(',');
            throw Error.make(Error.Status.BAD_REQUEST, 'Only one of ' + supportedSchemaTypesStr + ' is allowed in the request payload body.');
        }

        const payloadStorageRecordSchemaType = payloadStorageRecordSchemaTypes[0];

        Params.checkObject(req.body[payloadStorageRecordSchemaType], payloadStorageRecordSchemaTypes[0], false);


        if (payloadStorageRecordSchemaType) {
            const validationResult = SchemaManagerFactory
                .build(payloadStorageRecordSchemaType)
                .validate(req.body[payloadStorageRecordSchemaType]);

            if (validationResult.err) {
                throw Error.make(Error.Status.BAD_REQUEST, validationResult.err);
            }

            dataset.storageSchemaRecordType = payloadStorageRecordSchemaType;
            dataset.storageSchemaRecord = req.body[payloadStorageRecordSchemaType];
        }
    }

}
