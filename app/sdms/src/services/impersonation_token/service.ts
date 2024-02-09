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
import { ImpersonationTokenHandler } from './handler';
import { ImpersonationTokenOps } from './optype';
import { CallContext } from '../../shared/context';

const router = Router();

// generate an impersonation token
router.post('/', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'impersonation-token-generate';
    await ImpersonationTokenHandler.handler(req, res, ImpersonationTokenOps.Generate);
});

// refresh an impersonation token
router.put('/', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'impersonation-token-refresh';
    await ImpersonationTokenHandler.handler(req, res, ImpersonationTokenOps.Refresh);
});

export { router as ImpersonationTokenRouter };
