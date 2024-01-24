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

import { Request as expRequest, Response as expResponse, Router } from 'express';
import { UserHandler } from './handler';
import { UserOP } from './optype';
import { CallContext } from '../../shared/context';

const router = Router();

// Add a registered user to a resource
router.put('/', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'user-add';
    await UserHandler.handler(req, res, UserOP.Add);
});

// Retrieve user roles
router.get('/', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'user-list';
    await UserHandler.handler(req, res, UserOP.List);
});

// Remove a user from subproject
router.delete('/', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'user-remove';
    await UserHandler.handler(req, res, UserOP.Remove);
});

// retrieve the roles of the user
router.get('/roles', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'user-roles';
    await UserHandler.handler(req, res, UserOP.Roles);
});

export { router as UserRouter };
