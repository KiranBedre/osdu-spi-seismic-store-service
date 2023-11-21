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