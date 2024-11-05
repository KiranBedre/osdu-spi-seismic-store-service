import { Config } from '../cloud';

export enum JobType {
    SyncV3V4,
}

export const jobTypes = {} as {
    [key in JobType]: {
        getQueueName(): string;
    };
};

jobTypes[JobType.SyncV3V4] = {
    getQueueName(): string {
        return Config.SDMS_V3_V4_SYNC_QUEUE;
    },
};
