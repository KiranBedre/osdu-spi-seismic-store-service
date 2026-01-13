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

import sinon from "sinon";
import { AWSSSMhelper } from "../../../../src/cloud/providers/aws/ssmhelper";
import { Tx } from "../../utils";
import {Config} from '../../../../src/cloud';

export class TestAWSSSMHelper {
    private static sandbox: sinon.SinonSandbox;
    private static ssmHelper: AWSSSMhelper;

    public static run() {
        describe(Tx.testInit('AWS SSM Helper'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'amazon');
                this.sandbox.replace(Config, 'FEATURE_FLAG_LOGGING', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_TRACE', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_STACKDRIVER_EXPORTER', false);
                this.ssmHelper = new AWSSSMhelper();
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testGetSSMParameter();
        });
    }

    private static testGetSSMParameter() {
        Tx.sectionInit('Get SSM Parameter');

        Tx.test(async () => {
            const param = "TestParam";
            const value = "TestValue";

            this.sandbox.stub(this.ssmHelper['ssm'], "send").resolves({
                Parameter: {
                    Value: value
                }
            });

            const result = await this.ssmHelper.getSSMParameter(param);

            Tx.checkTrue(result === value);
        })
        Tx.test(async () => {
            this.sandbox.stub(this.ssmHelper['ssm'], "send").rejects(new Error('test error'));

            try {
                await this.ssmHelper.getSSMParameter("TestParam");
            }
            catch (err) {
                Tx.checkTrue(err.message === "test error");
            }
        })
    }
    
}
