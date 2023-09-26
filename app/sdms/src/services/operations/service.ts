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

import { Request, Response, Router } from 'express';
import { Handler } from './handler';
import { Operation } from './optype';

const router = Router();

// push a bulk delete operation
router.put('/bulk-delete', async (req: Request, res: Response) => {
    await Handler.handler(req, res, Operation.BulkDeletePush);
});

// get the status of a bulk delete operation
router.get('/bulk-delete/:operation-id', async (req: Request, res: Response) => {
    await Handler.handler(req, res, Operation.BulkDeleteStatus);
});

export { router as OperationsRouter };
