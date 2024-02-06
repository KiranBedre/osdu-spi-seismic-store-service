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

import axios from 'axios';
import { Config } from './shared/config';
import { Utils } from './shared/utils';

export class Entitlement {
    public static async addUserToGroup(group: string | undefined, userId: string, userRole = 'MEMBER') {
        if (!group) {
            return;
        }
        const data = JSON.stringify({
            email: userId,
            role: userRole,
        });
        const config = {
            method: 'post',
            url: `https://evt.api.enterprisedata.cloud.slb-ds.com/api/entitlements/v2/groups/${encodeURIComponent(
                group
            )}/members`,
            headers: {
                accept: 'application/json',
                'data-partition-id': Config.partition,
                Authorization: `Bearer ${Config.idToken}`,
                'Content-Type': 'application/json',
            },
            data: data,
        };
        const result = await Utils.sendAxiosRequest(axios(config), false);
        if (result?.status === 200) {
            return;
        } else if (result?.response?.status === 409) {
            return;
        } else {
            throw result;
        }
    }
    public static async removeUserFromGroup(group: string | undefined, userId: string) {
        if (!group) {
            return;
        }
        const config = {
            method: 'delete',
            url: `${Config.osduUrl}/api/entitlements/v2/groups/${encodeURIComponent(group)}/members/${userId}`,
            headers: {
                accept: '*/*',
                'data-partition-id': Config.partition,
                Authorization: `Bearer ${Config.idToken}`,
                Accept: '*/*;',
            },
        };
        await Utils.sendAxiosRequest(axios(config), false);
    }
}
