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
import { AwsTrace } from "../../../../src/cloud/providers/aws/trace";
import { Tx } from "../../utils";
export class TestAwsTrace {
    private static sandbox: sinon.SinonSandbox;
    private static awsTrace: AwsTrace;
    public static run() {
        describe(Tx.testInit('AWS SSM Helper'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.awsTrace = new AwsTrace();
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testStart();
        });
    }

    private static testStart() {
        Tx.sectionInit('Start');

        Tx.test(() => {

            
            const result = this.awsTrace.start();

            Tx.checkTrue(result === undefined);
        })
    }

}