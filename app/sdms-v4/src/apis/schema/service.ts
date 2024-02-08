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
import { Operation } from './operations';
import { SchemaHandler } from './handler';
import { Context } from '../../shared/context';

const SchemaRouter = Router();

SchemaRouter.put('/v1', async (req: expRequest, res: expResponse) => {
    Context.endpointId = 'registerRecord-' + Context.schemaEndpoint.name;
    await SchemaHandler.handler(req, res, Operation.RegisterPatch);
});

SchemaRouter.get('/v1/list', async (req: expRequest, res: expResponse) => {
    Context.endpointId = 'listRecords-' + Context.schemaEndpoint.name;
    await SchemaHandler.handler(req, res, Operation.ListSchemas);
});

SchemaRouter.get('/v1/record/:id', async (req: expRequest, res: expResponse) => {
    Context.endpointId = 'getRecordById-' + Context.schemaEndpoint.name;
    await SchemaHandler.handler(req, res, Operation.Get);
});

SchemaRouter.delete('/v1/record/:id', async (req: expRequest, res: expResponse) => {
    Context.endpointId = 'deleteRecord-' + Context.schemaEndpoint.name;
    await SchemaHandler.handler(req, res, Operation.DeleteSchema);
});

SchemaRouter.get('/v1/record/:id/versions', async (req: expRequest, res: expResponse) => {
    Context.endpointId = 'listRecordVersions-' + Context.schemaEndpoint.name;
    await SchemaHandler.handler(req, res, Operation.GetAllVersionIDsOfSchema);
});

SchemaRouter.get('/v1/record/:id/version/:version', async (req: expRequest, res: expResponse) => {
    Context.endpointId = 'getRecordByVersion-' + Context.schemaEndpoint.name;
    await SchemaHandler.handler(req, res, Operation.GetVersionedSchema);
});

export { SchemaRouter };
