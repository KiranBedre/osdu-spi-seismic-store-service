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

import { Request, Response, Router } from 'express';
import { Handler } from './handler';
import { Operation } from './optype';
import { CallContext } from '../../shared/context';

const router = Router();

// push a bulk delete operation
router.put('/bulk-delete', async (req: Request, res: Response) => {
    CallContext.endpointId = 'operation-bulk-delete-push';
    await Handler.handle(req, res, Operation.BulkDeletePush);
});

// get the status of a bulk delete operation
router.get('/bulk-delete/:operationid', async (req: Request, res: Response) => {
    CallContext.endpointId = 'operation-bulk-delete-get';
    await Handler.handle(req, res, Operation.BulkDeleteStatus);
});

// push a bulk change tier operation
router.put('/change-tier', async (req: Request, res: Response) => {
    await Handler.handle(req, res, Operation.BulkChangeTierPush)
});

// get the status of a bulk change tier operation
router.get('/change-tier/:operationid', async (req: Request, res: Response) => {
    await Handler.handle(req, res, Operation.BulkChangeTierStatus);
});

// trigger a point-in-time restore operation
router.post('/restore', async (req: Request, res: Response) => {
    CallContext.endpointId = 'operation-restore-post';
    await Handler.handle(req, res, Operation.RestorePush);
});

// get restore operation status
router.get('/restore/:operationId', async (req: Request, res: Response) => {
    CallContext.endpointId = 'operation-restore-status';
    await Handler.handle(req, res, Operation.RestoreStatus);
});

export { router as OperationRouter };
