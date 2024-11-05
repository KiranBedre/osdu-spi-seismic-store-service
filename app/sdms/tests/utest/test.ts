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

import { Locker } from '../../src/services/dataset/locker'
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
import { ParserTest } from './services/dataset/parser';
import { FilterParserTest } from './services/dataset/filter-parser';
import { TestShared } from './shared/test';

TestAuthorization.run();
TestServices.run();
TestServicesUserHandler.run();
TestImpersonationTokenHandler.run();
TestServicesUtilityHandler.run();
TestDao.run();
DatasetDAOTest.run();
ParserTest.run();
FilterParserTest.run();
TestCloud.run();
TestDES.run();
TestShared.run();
