
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
