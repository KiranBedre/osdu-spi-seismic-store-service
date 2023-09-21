// ============================================================================
// Copyright 2017-2019, Schlumberger
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
import { SubProjectHandler } from './handler';
import { SubProjectOP } from './optype';

const router = Router();

// register a new subproject
router.post('/tenant/:tenantid/subproject/:subprojectid', async (req: expRequest, res: expResponse) => {
    await SubProjectHandler.handler(req, res, SubProjectOP.Create);
});

// get a subproject
router.get('/tenant/:tenantid/subproject/:subprojectid', async (req: expRequest, res: expResponse) => {
    await SubProjectHandler.handler(req, res, SubProjectOP.Get);
});

// delete a subproject
router.delete('/tenant/:tenantid/subproject/:subprojectid', async (req: expRequest, res: expResponse) => {
    await SubProjectHandler.handler(req, res, SubProjectOP.Delete);
});

// patch a subproject
router.patch('/tenant/:tenantid/subproject/:subprojectid', async (req: expRequest, res: expResponse) => {
    await SubProjectHandler.handler(req, res, SubProjectOP.Patch);
});

// list all subprojects in a tenant
router.get('/tenant/:tenantid/', async (req: expRequest, res: expResponse) => {
    await SubProjectHandler.handler(req, res, SubProjectOP.List);
});

export { router as SubprojectRouter };
