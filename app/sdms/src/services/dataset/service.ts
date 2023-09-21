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

import { Request as expRequest, Response as expResponse, Router } from 'express';
import { DatasetHandler } from './handler';
import { DatasetOP } from './optype';

const router = Router();

// register a new dataset
router.post('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Register);
    });

// get a dataset
router.get('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Get);
    });

// list all datasets in a subproject (url query params)
router.get('/tenant/:tenantid/subproject/:subprojectid',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.List);
    });

// list all datasets in a subproject (body query params)
router.post('/tenant/:tenantid/subproject/:subprojectid',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.List);
    });

// delete a dataset
router.delete('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Delete);
    });

// patch a Dataset
router.patch('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Patch);
    });

// Lock a Dataset for opening
router.put('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/lock',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Lock);
    });

// UnLock a Dataset
router.put('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/unlock',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.UnLock);
    });

// check if a list of datasets exist in a subproject
router.post('/tenant/:tenantid/subproject/:subprojectid/exist',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Exists);
    });

// retrieve the dataset size for a list of datasets
router.post('/tenant/:tenantid/subproject/:subprojectid/sizes',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Sizes);
    });

// compute and return the dataset size and the date of when it was computed
router.post('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/size',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.ComputeSize);
    });

// retrieve the size of the subfolder/folder/dataset
router.get('/tenant/:tenantid/subproject/:subprojectid/size',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.GetSize);
    });

// check the permissions of a user on a dataset
router.get('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/permission',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.Permission);
    });

// check the dataset ctag
router.get('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/ctagcheck',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.CheckCTag);
    });

// list a path content
// [TODO] obsolete to remove in V4
router.get('/tenant/:tenantid/subproject/:subprojectid/readdsdirfulllist',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.ListContent);
    });

// insert tags for a existing dataset
router.put('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/gtags',
    async (req: expRequest, res: expResponse) => {
        await DatasetHandler.handler(req, res, DatasetOP.PutTags);
    });

// delete datasets with a given path within a subproject
router.delete('/tenant/:tenantid/subproject/:subprojectid/bulk-delete', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, DatasetOP.BulkDelete);
});

// get status of a bulk delete operation
router.get('/tenant/:tenantid/subproject/:subprojectid/bulk-delete', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, DatasetOP.BulkDeleteStatus);
});

export { router as DatasetRouter };
