// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Config, ConfigFactory } from '../../config';
import { AWSSSMhelper } from './ssmhelper';
import * as f from 'fs';
import path from 'path';
@ConfigFactory.register('aws')
export class AWSConfig extends Config {
    public static AWS_REGION: string;
    public static OSDU_INSTANCE_NAME: string;
    public static AWS_TENANT_GROUP_NAME: string;
    public static LOGGER_LEVEL: string;

    public async init(): Promise<void> {
        // init AWS specific configurations
        AWSConfig.AWS_REGION = process.env.AWS_REGION;
        AWSConfig.OSDU_INSTANCE_NAME = process.env.OSDU_INSTANCE_NAME;
        const awsSSMHelper = new AWSSSMhelper();
        AWSConfig.AWS_TENANT_GROUP_NAME = await awsSSMHelper.getSSMParameter(
            '/osdu/instances/' + AWSConfig.OSDU_INSTANCE_NAME + '/config/tenant-group/name'
        );
        // Logger
        AWSConfig.LOGGER_LEVEL = process.env.LOGGER_LEVEL || 'info';

        // read from files
        const fileLocation = process.env.PARAMETER_MOUNT_PATH
        const keyFile = path.join(fileLocation, 'REDIS_KEY');
        const keyData = f.readFileSync(keyFile).toString();
        const keyContent = JSON.parse(keyData).token;
        const addressFile = path.join(fileLocation, 'REDIS_HOST');
        const addressContent = f.readFileSync(addressFile).toString();
        const portFile = path.join(fileLocation, 'REDIS_PORT');
        const portContent = f.readFileSync(portFile).toString();

        Config.REDIS_HOST = addressContent;
        Config.REDIS_PORT = +portContent;
        Config.REDIS_KEY = keyContent;
    }
}
