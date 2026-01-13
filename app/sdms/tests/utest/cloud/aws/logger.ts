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

import { AwsLogger, logger } from '../../../../src/cloud/providers/aws/logger';
import sinon from 'sinon';
import { Tx } from '../../utils';
export class TestLogger {
    private static sandbox: sinon.SinonSandbox;
    private static awsLogger: AwsLogger;
    private static infoStub;
    private static debugStub;
    private static errorStub;
    public static run() {
        describe(Tx.testInit('AWS Logger'), () => {
            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.awsLogger = new AwsLogger();
                this.infoStub = this.sandbox.stub(logger, 'info');
                this.debugStub = this.sandbox.stub(logger, 'debug');
                this.errorStub = this.sandbox.stub(logger, 'error');
            });

            afterEach(() => { this.sandbox.restore(); });

            this.test();
        });
    }

    private static test() {
        Tx.sectionInit('log methods');

        Tx.test(() => {
            this.awsLogger.info('test');
            Tx.checkTrue(this.infoStub.calledOnceWith('test'));
        });

        Tx.test(() => {
            this.awsLogger.debug('test');
            Tx.checkTrue(this.debugStub.calledOnceWith('test'));
        });

        Tx.test(() => {
            this.awsLogger.error('test');
            Tx.checkTrue(this.errorStub.calledOnceWith('test'));
        });

        Tx.test(() => {
            const result = this.awsLogger.metric('testKey', 'testData');
            Tx.checkTrue(result === undefined);
        });
    }
}
