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

import { Error, Params } from '../../shared';
import { JobModel, IAnalyticsRequest } from '.';
import { Config } from '../../cloud';
import { Request as expRequest } from 'express';

export class AnalyticsParser {

    public static create(req: expRequest): JobModel[] {

        // check if body exist and is not empty
        Params.checkArray(req.body, 'body');
        const body = req.body[0];

        if (body.first_execution !== undefined) {
            const check = parseInt(body.first_execution, 10);
            if (Number.isNaN(check)) { throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'first_execution\' parameter is in wrong format.'))}
            if (check < 1 || check > 7) {
                throw Error.make(Error.Status.BAD_REQUEST,
                    '\'first_execution\' parameter must be between 1 - 7');
            }
        }

        if (body.freq_execution !== undefined) {
            const check = parseInt(body.freq_execution, 10);
            if (Number.isNaN(check)) { throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'freq_execution\' parameter is in wrong format.'))}
            if (check < 1) {
                throw Error.make(Error.Status.BAD_REQUEST,
                    '\'freq_execution\' parameter must be greater than 0');
            }
        }

        const job = {
            name: body.name,
            statistics: body.statistics,
            first_execution: body.first_execution,
            freq_execution: body.freq_execution,
        } as JobModel

        // check user input params
        Params.checkString(job.name, 'name');
        Params.checkString(job.statistics, 'statistics');

        job.statistics = job.statistics.replace(/\s/g, '').toLowerCase(); // remove whitespace
        job.first_execution = job.first_execution ?
            this.getNextDayOfWeekTimestamp(+body.first_execution - 1):
            this.getNextDayOfWeekTimestamp(new Date().getUTCDay());
        job.freq_execution = job.freq_execution ? +job.freq_execution : 7;

        return [job];
    }

    public static list(req: expRequest): IAnalyticsRequest{

        const args = {
            subproject: req.params.subprojectid,
        } as IAnalyticsRequest

        this.checkFilterDate(req.query['filter-date'] as string, args);
        this.checkExtension(req.query.extension as string);
        return args;
    }

    public static delete(req: expRequest): string {

        const subprojectid = req.params.subprojectid;

        Params.checkString(subprojectid, 'subprojectid');

        return subprojectid;
    }

    public static connectionString(req: expRequest) {
        const args = {
            subproject: req.params.subprojectid,
        } as IAnalyticsRequest

        this.checkFilterDate(req.query['filter-date'] as string, args);
        this.checkExtension(req.query.extension as string);
        return args;
    }

    public static getNextDayOfWeekTimestamp(dayOfWeek: number): number {
        const today = new Date();
        today.setUTCHours(0,0,0,0);
        const currentDay = today.getUTCDay();
        const difference = dayOfWeek - currentDay;
        const nextDay = difference > 0 ? today.getUTCDate() + difference :
            today.getUTCDate() + (7 - Math.abs(difference));
        const nextDate = new Date(today.getUTCFullYear(), today.getUTCMonth(), nextDay);
        nextDate.setUTCHours(0,0,0,0);
        return nextDate.getTime();
    }

    private static checkExtension(extension: string = null) {
        if (extension !== null) {
            Config.SDMS_ANALYTICS_CONTAINER_NAME += '-' + extension;
        }
    }

    private static checkFilterDate(filter: string, args: IAnalyticsRequest) {
        if (!filter) {
            return;
        }

        const regex = /^(?:\d{4}|(?:\d{4}-\d{2})|(?:\d{4}-\d{2}-\d{2}))$/;
        if (!regex.test(filter)) {
            throw Error.make(Error.Status.BAD_REQUEST, 'Invalid date format. The \'filter-date\' must be in the format YYYY or YYYY-MM or YYYY-MM-DD.');
        }

        const filterDate = new Date(filter);
        if (isNaN(filterDate.getTime())) {
            throw Error.make(Error.Status.BAD_REQUEST, 'Invalid date. The \'filter-date\' is invalid.');
        }

        if (filter.length >= 4) {
            args.year = filterDate.getUTCFullYear().toString();
        }

        if (filter.length >= 7) {
            args.month = (filterDate.getUTCMonth()+1).toString().padStart(2, '0');
        }

        if (filter.length === 10) {
            args.day = filterDate.getUTCDate().toString().padStart(2, '0');
        }
    }

}
