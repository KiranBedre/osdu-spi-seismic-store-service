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
