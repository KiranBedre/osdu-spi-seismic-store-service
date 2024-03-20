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
import { Config } from './shared/config';
import { Utils } from './shared/utils';
import { expect } from 'chai';

export class TestInfo {
    private getRequestOptions(): AxiosRequestConfig {
        return {
            headers: {
                'data-partition-id': Config.partition,
                Authorization: 'Bearer ' + Config.idToken,
            },
        } as AxiosRequestConfig;
    }

    public run() {
        describe('# Test service info\n', () => {
            this.info();
        });
    }

    private info() {
        it('service info', async () => {
            const result = await Utils.sendAxiosRequest(axios.get(Config.url + '/info', this.getRequestOptions()));
            expect(result?.data.info).to.not.be.undefined;;
        });
    }

}
