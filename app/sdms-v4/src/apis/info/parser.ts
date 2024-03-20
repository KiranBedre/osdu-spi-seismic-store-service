// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { Config } from '../../cloud/config';
import { Info } from './model';

export class Parser {

    public static async getInfo(): Promise<Info> {
        const info = {} as Info;
        info.group_id = Config.GROUP_ID;
        info.artifact_id = Config.ARTIFACT_ID;
        info.build_time = Config.BUILD_TIME;
        info.branch = Config.BRANCH;
        info.commit_id = Config.COMMIT_ID;
        info.commit_message = Config.COMMIT_MESSAGE;
        info.version = Config.VERSION;
        info.connected_outer_services = Config.CONNECTED_OUTER_SERVICES;
        return info;
    }

}
