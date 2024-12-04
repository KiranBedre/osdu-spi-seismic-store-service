import axios from 'axios';
import url from 'url';
import { join as path_join } from 'path';
import { ConfigGoogle } from './config';


export class DataPartitionInfo {
    public dataPartitionId: string
    public gcProjectId: string
    public bucket: string
    public policyServiceEnabled: boolean | null
    public datastoreDatabaseId?: string

    constructor(
        dataPartitionId: string,
        gcProjectId: string,
        bucket: string,
        policyServiceEnabled: boolean | null,
        datastoreDatabaseId?: string
    ) {
        this.dataPartitionId = dataPartitionId;
        this.bucket = bucket;
        this.gcProjectId = gcProjectId;
        this.policyServiceEnabled = policyServiceEnabled;
        this.datastoreDatabaseId = datastoreDatabaseId;
    }

    private static isPolicyEnabled(dataPartitionId: string, partitionData: object): boolean {
        const policyEnabled = partitionData[`${dataPartitionId}.feature.policy.enabled`]
        if (policyEnabled === undefined) {
            return false
        } else {
            return policyEnabled['value'] === 'true'
        }
    }

    public static async fromDataPartitionId(dataPartitionId: string): Promise<DataPartitionInfo> {
        const partitionUrl = new url.URL(ConfigGoogle.DES_SERVICE_HOST_PARTITION);
        partitionUrl.pathname = path_join(
            partitionUrl.pathname,
            'api/partition/v1/partitions',
            dataPartitionId
        );
        const partitionResponse = await axios.get(partitionUrl.toString());

        const partitionData = partitionResponse['data'];
        const gcProjectId = partitionData['projectId']['value']
        dataPartitionId = partitionData['dataPartitionId']['value']
        const bucket = partitionData['seismicBucket']['value']
        const datastoreDatabaseId = partitionData['osm.datastore.database.id']?.value;
        const policyEnabled = this.isPolicyEnabled(dataPartitionId, partitionData)
        return new DataPartitionInfo(
            dataPartitionId,
            gcProjectId,
            bucket,
            policyEnabled,
            datastoreDatabaseId
        );
    }
}
