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

import { AWSConfig } from './config';

import { SSM, GetParameterCommand } from '@aws-sdk/client-ssm';

export class AWSSSMhelper {
    private ssm: SSM;

    public constructor() {
        this.ssm = new SSM({
            region: AWSConfig.AWS_REGION,
            apiVersion: '2014-11-06',
        });
    }

    public async getSSMParameter(paramName: string): Promise<string> {
        const options = {
            Name: paramName,
            WithDecryption: true,
        };
        try {
            const command = new GetParameterCommand(options);
            const data = await this.ssm.send(command);
            return data.Parameter.Value;
        } catch (err) {
            // tslint:disable-next-line:no-console
            console.log(err.code + ': ' + err.message);
        }
    }
}
