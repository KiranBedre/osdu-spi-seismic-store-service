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
import { AppHandler } from './handler';
import { AppOp } from './optype';
import { CallContext } from '../../shared/context';

const router = Router();

// register a new application
router.post('/', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'app-register';
    await AppHandler.handler(req, res, AppOp.Register);
});

// list the registered applications
router.get('/', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'app-list';
    await AppHandler.handler(req, res, AppOp.List);
});

// register a trusted application
router.post('/trusted', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'trustedapp-register';
    await AppHandler.handler(req, res, AppOp.RegisterTrusted);
});

// list the trusted applications
router.get('/trusted', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'trustedapp-list';
    await AppHandler.handler(req, res, AppOp.ListTrusted);
});

export { router as SvcAppRouter };
