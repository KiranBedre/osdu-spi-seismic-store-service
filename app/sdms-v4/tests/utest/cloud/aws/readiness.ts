import sinon from "sinon";
import { Tx } from "../../utils";
import { AwsReadiness } from "../../../../src/cloud/providers/aws";

export class TestAwsReadiness {
    private static sandbox: sinon.SinonSandbox;
    private static readiness: AwsReadiness;

    public static run() {
        describe(Tx.testInit('AWS Readiness'), () => {
            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.readiness = new AwsReadiness();
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testHandleReadinessCheck();
        } );

    }

    private static testHandleReadinessCheck() {
        Tx.sectionInit('handle readiness check');

        Tx.test(async () => {
            const result = await this.readiness.handleReadinessCheck();
            Tx.checkTrue(result);
        });
    }
}