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

import { lockerInstance } from '../../src/services/dataset/locker'

// Wrap in async IIFE to ensure Locker initializes before tests run
(async () => {
    try {
        await lockerInstance.init();

        // Import and run test suites after Locker is initialized
        const { TestAuthorization } = require('./auth/test');
        const { TestCloud } = require('./cloud/test');
        const { TestDao } = require('./dao/test');
        const { TestDES } = require('./dataecosystem/test');
        const { TestServices } = require('./services/test');
        const { TestServicesUserHandler } = require('./services/user/handler');
        const { TestImpersonationTokenHandler } = require('./services/impersonation_token/handler');
        const { TestServicesUtilityHandler } = require('./services/utility/handler');
        const { DatasetDAOTest } = require('./services/dataset/dao');
        const { ParserTest } = require('./services/dataset/parser');
        const { FilterParserTest } = require('./services/dataset/filter-parser');
        const { TestShared } = require('./shared/test');

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
    } catch (error) {
        console.error('Failed to initialize tests:', error);
        process.exit(1);
    }
})();
