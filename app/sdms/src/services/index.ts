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

import { Router } from 'express';
import { Config } from '../cloud';
import { DatasetRouter } from './dataset/service';
import { GeneralRouter } from './general/service';
import { ImpTokenRouter } from './imptoken/service';
import { ImpersonationTokenRouter } from './impersonation_token/service';
import { SubprojectRouter } from './subproject/service';
import { SvcAppRouter } from './svcapp/service';
import { TenantRouter } from './tenant/service';
import { UserRouter } from './user/service';
import { UtilityRouter } from './utility/service';
import { OperationRouter } from './operation/service';

const router = Router();

// dataset
router.use(Config.API_BASE_PATH + '/dataset', DatasetRouter);

// general
router.use(Config.API_BASE_PATH + '/svcstatus', GeneralRouter);

// impersonation token
// [TODO] obsolete to remove in V4
router.use(Config.API_BASE_PATH + '/imptoken', ImpTokenRouter);

// impersonation token
router.use(Config.API_BASE_PATH + '/impersonation-token', ImpersonationTokenRouter);

// subproject
router.use(Config.API_BASE_PATH + '/subproject', SubprojectRouter);

// svcapp
router.use(Config.API_BASE_PATH + '/app', SvcAppRouter);

// tenant
router.use(Config.API_BASE_PATH + '/tenant', TenantRouter);

// user
router.use(Config.API_BASE_PATH + '/user', UserRouter);

// utility
router.use(Config.API_BASE_PATH + '/utility', UtilityRouter);

// operation
router.use(Config.API_BASE_PATH + '/operation', OperationRouter);

export { router as ServiceRouter };
