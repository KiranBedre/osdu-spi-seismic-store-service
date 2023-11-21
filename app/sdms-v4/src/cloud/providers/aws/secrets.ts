// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { getInMemoryCacheInstance } from '../../../shared';
import { PartitionCoreService } from '../../../services';
import { AWSSSMhelper } from './ssmhelper';
import { AWSConfig } from './config';

export class AwsSecrets {

    public static async getTenantIdFromPartitionID(dataPartitionID: string): Promise<string> {
        const cache = getInMemoryCacheInstance();
        const cacheKey = 'aws-tenant' + dataPartitionID;
        const res = cache.get<string>(cacheKey);
        if (res !== undefined) {
            return res;
        };

        const results = await PartitionCoreService.getPartitionConfiguration(dataPartitionID);
        const tenantInfo = results['tenantId']['value'];
        cache.set<string>(cacheKey, tenantInfo, 3600);
        return tenantInfo;
    }

    public static async getBucketFromPartitionID(dataPartitionID: string, awsSSMHelper: AWSSSMhelper = new AWSSSMhelper()): Promise<string> {
        const cache = getInMemoryCacheInstance();
        const cacheKey = 'aws-bucket' + dataPartitionID;
        const res = cache.get<string>(cacheKey);
        if (res !== undefined) {
            return res;
        };

        const tenantId = await AwsSecrets.getTenantIdFromPartitionID(dataPartitionID);
        const tenantSsmPrefix = '/osdu/tenant-groups/' + AWSConfig.AWS_TENANT_GROUP_NAME + '/tenants/' + tenantId;
        const awsBucket = await awsSSMHelper.getSSMParameter(
            tenantSsmPrefix + '/seismic-ddms-v4/SeismicDDMSBucket/name'
        );

        cache.set<string>(cacheKey, awsBucket, 3600);
        return awsBucket;

    }

}
