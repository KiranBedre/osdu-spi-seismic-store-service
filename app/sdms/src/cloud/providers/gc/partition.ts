import axios from 'axios';
import http from 'http';
import url from 'url';
import { join as path_join } from 'path';
import { ConfigGoogle } from './config';


export class DataPartitionInfo {
    public dataPartitionId: string
    public gcProjectId: string
    public bucket: string

    constructor(dataPartitionId: string, gcProjectId: string, bucket: string) {
        this.dataPartitionId = dataPartitionId;
        this.bucket = bucket;
        this.gcProjectId = gcProjectId;
    }

    public static async fromDataPartitionId(dataPartitionId: string): Promise<DataPartitionInfo> {
        const partitionUrl = new url.URL(ConfigGoogle.DES_SERVICE_HOST_PARTITION);
        partitionUrl.pathname = path_join(
            'api/partition/v1/partitions',
            dataPartitionId
        );
        const partitionResponse = await axios.get(partitionUrl.toString());

        const partitionData = partitionResponse['data'];
        const gcProjectId = partitionData['projectId']['value']
        dataPartitionId = partitionData['dataPartitionId']['value']
        const bucket = partitionData['seismicBucket']['value']
        return new DataPartitionInfo(
            dataPartitionId,
            gcProjectId,
            bucket
        );
    }
}
