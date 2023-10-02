// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { Router, Request as expRequest, Response as expResponse } from 'express';

import { ConnectionsHandler } from './handler';
import { Operation } from './operations';

const ConnectionStringRouter = Router();

ConnectionStringRouter.get('/upload/record/:id', async (req: expRequest, res: expResponse) => {
    await ConnectionsHandler.handler(req, res, Operation.GetUploadConnectionString);
});

ConnectionStringRouter.get('/download/record/:id', async (req: expRequest, res: expResponse) => {
    await ConnectionsHandler.handler(req, res, Operation.GetDownloadConnectionString);
});

export { ConnectionStringRouter };
