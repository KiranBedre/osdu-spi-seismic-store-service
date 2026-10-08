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
import { UtilityHandler } from './handler';
import { UtilityOP } from './optype';
import { CallContext } from '../../shared/context';

const router = Router();

// list a path content (url query params)
router.get('/ls', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'utility-ls-get';
    await UtilityHandler.handler(req, res, UtilityOP.LS);
});

// list a path content (body query params)
router.post('/ls', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'utility-ls-post';
    await UtilityHandler.handler(req, res, UtilityOP.LS);
});

// copy a dataset
router.post('/cp', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'utility-cp';
    await UtilityHandler.handler(req, res, UtilityOP.CP);
});

// get the gcs access token
router.get('/gcs-access-token', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'utility-gcs-access-token';
    await UtilityHandler.handler(req, res, UtilityOP.GCSTOKEN);
});

// get the upload connection string
router.get('/upload-connection-string', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'utility-upload-connection-string';
    await UtilityHandler.handler(req, res, UtilityOP.UPLOAD_CONNECTION_STRING);
});

// get the download connection string
router.get('/download-connection-string', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'utility-download-connection-string';
    await UtilityHandler.handler(req, res, UtilityOP.DOWNLOAD_CONNECTION_STRING);
});

// get the list of supported storage tiers
router.get('/storage-tiers', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'utility-storage-tiers';
    await UtilityHandler.handler(req, res, UtilityOP.STORAGE_TIERS);
});

export { router as UtilityRouter };
