import sinon from 'sinon';

import {AzureConfig, AzureTaskQueue} from "../../../../src/cloud/providers/azure";
import { Tx } from '../../utils';
import {QueueClient, QueueCreateIfNotExistsResponse} from "@azure/storage-queue";
import {IBulkDeleteOperationQueueTask, IOperationQueueTask} from "../../../../src/services/operation/model";
import {v4 as uuidv4} from "uuid";
import {Config} from "../../../../src/cloud";
import { OperationType } from '../../../../src/services/operation/register';
import {CachingQueueClientFactory} from "../../../../src/cloud/providers/azure/taskQueue";
import * as Assert from "assert";
import {assert} from "chai";


export class TestTaskQueue {

    private static sandbox: sinon.SinonSandbox;
    private static taskQueue: AzureTaskQueue;
    private static queueClientFactory: CachingQueueClientFactory;

    public static run() {
        Config.CLOUDPROVIDER = 'azure';
        AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT = 'storageQueueEndpoint'
        Config.SMDS_DELETION_QUEUE = 'deletionqueue'
        this.sandbox = sinon.createSandbox();
        this.taskQueue = new AzureTaskQueue();
        this.queueClientFactory = new CachingQueueClientFactory();
        this.sandbox.stub(QueueClient.prototype, 'createIfNotExists')
            .resolves({ succeeded: true } as QueueCreateIfNotExistsResponse);

        describe(Tx.testInit('azure task queue test'), () => {
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
