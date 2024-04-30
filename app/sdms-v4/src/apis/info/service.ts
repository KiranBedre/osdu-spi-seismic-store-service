// ============================================================================
// Copyright 2017-2024, Schlumberger
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
import { Context } from '../../shared';
import { Operation } from './operations';
import { InfoHandler } from './handler';

const InfoRouter = Router();

InfoRouter.get('/', async (req: expRequest, res: expResponse) => {
    Context.endpointId = 'getInfo';
    await InfoHandler.handler(res, Operation.Info);
});

export { InfoRouter };
