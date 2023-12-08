import sinon from 'sinon';

import {AzureConfig, AzureTaskQueue} from "../../../../src/cloud/providers/azure";
import { Tx } from '../../utils';
import {QueueClient, QueueCreateIfNotExistsResponse} from "@azure/storage-queue";
import {IOperationQueueTask} from "../../../../src/shared/model";
import {v4 as uuidv4} from "uuid";
import {Config} from "../../../../src/cloud";
import { OperationType } from '../../../../src/shared/register';


export class TestTaskQueue {

    private static sandbox: sinon.SinonSandbox;
    private static taskQueue: AzureTaskQueue;

    public static run() {
        describe(Tx.testInit('azure task queue test'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.taskQueue = new AzureTaskQueue();
                this.sandbox.stub(QueueClient.prototype, 'createIfNotExists')
                    .resolves({ succeeded: true } as QueueCreateIfNotExistsResponse);
                const x = AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT;
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'azure');
                this.sandbox.define(Config, 'SMDS_DELETION_QUEUE', 'deletionqueue');
                this.sandbox.define(AzureConfig, 'AZURE_STORAGE_QUEUE_ENDPOINT', 'storageQueueEndpoint');
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.pushTask();
        });
    }

    private static pushTask() {
        const task = {
            operation_id: uuidv4(),
            type: OperationType.BULK_DELETE
        } as IOperationQueueTask;

        Tx.sectionInit('pushTask');

        Tx.test(async () => {
            const clientStub = this.sandbox.stub(QueueClient.prototype, 'sendMessage');
            await this.taskQueue.pushTask(task);
            const message = Buffer.from(JSON.stringify(task)).toString('base64');
            this.sandbox.assert.calledOnceWithExactly(
                clientStub,
                message
            );
        });
    }
}
