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
import { AnalyticsHandler } from './handler';
import { AnalyticsOP } from './optype';
import { CallContext } from '../../shared/context';

const router = Router();

// create/update a analytics schedule
router.put('/job', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'analytics-create-schedule';
    await AnalyticsHandler.handler(req, res, AnalyticsOP.CREATE);
});

// list available reports for a subproject
router.get('/job/:subprojectid',
    async (req: expRequest, res: expResponse) => {
        CallContext.endpointId = 'analytics-list-reports';
        await AnalyticsHandler.handler(req, res, AnalyticsOP.LIST_REPORTS);
    });

// list available reports for a tenant
router.get('/tenant/job',
    async (req: expRequest, res: expResponse) => {
        CallContext.endpointId = 'analytics-list-reports-tenant';
        await AnalyticsHandler.handler(req, res, AnalyticsOP.LIST_REPORTS_TENANT);
    });

// list the analytics schedules
router.get('/job', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'analytics-list-schedules';
    await AnalyticsHandler.handler(req, res, AnalyticsOP.LIST_SCHEDULES);
});

// Delete a analytics schedule
router.delete('/job/:subprojectid', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'analytics-delete-schedule';
    await AnalyticsHandler.handler(req, res, AnalyticsOP.DELETE);
});

// Delete a analytics schedule partition
router.delete('/tenant/job', async (req: expRequest, res: expResponse) => {
    CallContext.endpointId = 'analytics-delete-schedule-tenant';
    await AnalyticsHandler.handler(req, res, AnalyticsOP.DELETE);
});

// generate connection string to download the report
router.get('/job/:subprojectid/connection-string',
    async (req: expRequest, res: expResponse) => {
        CallContext.endpointId = 'analytics-report-download-connection-string';
        await AnalyticsHandler.handler(req, res, AnalyticsOP.DOWNLOAD_CONNECTION_STRING);
    });

// generate connection string to download the report for tenant
router.get('/tenant/job/connection-string',
    async (req: expRequest, res: expResponse) => {
        CallContext.endpointId = 'analytics-report-download-connection-string-tenant';
        await AnalyticsHandler.handler(req, res, AnalyticsOP.DOWNLOAD_CONNECTION_STRING);
    });

export { router as AnalyticsRouter };
