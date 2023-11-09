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

import { Config } from '../../src/cloud';

Config.CLOUDPROVIDER = 'google'
Config.FEATURE_FLAG_LOGGING = false;
Config.FEATURE_FLAG_TRACE = false;
Config.FEATURE_FLAG_STACKDRIVER_EXPORTER = false;

import { Locker } from '../../src/services/dataset/locker'
// tslint:disable-next-line: no-floating-promises no-console
Locker.init().catch((error)=>{ console.log(error);});

import { TestAuthorization } from './auth/test';
import { TestCloud } from './cloud/test';
import { TestDao } from './dao/test';
import { TestDES } from './dataecosystem/test';
import { TestServices } from './services/test';
import { TestServicesUserHandler } from './services/user/handler';
import { TestImpersonationTokenHandler } from './services/impersonation_token/handler';
import { TestServicesUtilityHandler } from './services/utility/handler';
import { DatasetDAOTest } from './services/dataset/dao';
import { TestShared } from './shared/test';

TestAuthorization.run();
TestServices.run();
TestServicesUserHandler.run();
TestImpersonationTokenHandler.run();
TestServicesUtilityHandler.run();
TestDao.run();
DatasetDAOTest.run();
TestCloud.run();
TestDES.run();
TestShared.run();
