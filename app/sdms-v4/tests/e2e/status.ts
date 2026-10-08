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

import axios, { AxiosRequestConfig } from 'axios';
import { Config, Utils } from './shared';
import { expect } from 'chai';

export class TestStatus {
    private getRequestOptions(): AxiosRequestConfig {
        return {
            headers: {
                'data-partition-id': Config.partition,
                Authorization: 'Bearer ' + Config.idToken,
            },
        } as AxiosRequestConfig;
    }

    public run() {
        describe('# Test service status\n', () => {
            this.status();
            this.readiness();
        });
    }

    private status() {
        it('service status', async () => {
            const result = await Utils.sendAxiosRequest(axios.get(Config.url + '/status', this.getRequestOptions()));
            expect(result?.data.status).to.be.equals('running');
        }).retries(Config.retries);
    }

    private readiness() {
        it('service status readiness', async () => {
            const result = await Utils.sendAxiosRequest(
                axios.get(Config.url + '/status/readiness', this.getRequestOptions())
            );
            expect(result?.data.ready).to.be.true;
        }).retries(Config.retries);
    }
}
