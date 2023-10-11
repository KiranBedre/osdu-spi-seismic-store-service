import { Tx } from "../../utils";
import { AWSSSMhelper } from "../../../../src/cloud/providers/aws/ssmhelper";
import sinon from "sinon";

export class TestAWSSSMHelper {
    private static sandbox: sinon.SinonSandbox;
    private static ssmHelper: AWSSSMhelper;

    public static run() {
        describe(Tx.testInit('AWS SSM Helper'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
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

            this.sandbox.stub((this.ssmHelper as any).ssm, 'send').resolves({Parameter: {Value: value}})
            const result = await this.ssmHelper.getSSMParameter(param);

            Tx.checkTrue(result === value);
        })
        Tx.test(async () => {
            this.sandbox.stub((this.ssmHelper as any).ssm, 'send').rejects(new Error("Test Error"))

            try {
                await this.ssmHelper.getSSMParameter("TestParam");
            }
            catch (err) {
                Tx.checkTrue(err.message === "Test Error");
            }
        })
    }
}
