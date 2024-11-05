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

import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import { AWSConfig } from './config';
import {AWSSSMhelper} from './ssmhelper';
import {AWSSTShelper} from './stshelper';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import axios from 'axios';
import qs from 'qs';
import aws from 'aws-sdk';
import {AWSDataEcosystemServices} from './dataecosystem';

const KExpiresMargin = 300; // 5 minutes

@CredentialsFactory.register('aws')
export class AWSCredentials extends AbstractCredentials {

    private static awsSSMHelper = new AWSSSMhelper();
    private awsSTSHelper = new AWSSTShelper();
    private static servicePrincipalCredential: IAccessTokenModel = {
        access_token: undefined,
        expires_in: 0,
        token_type: undefined
    };

    // [OBSOLETE] to remove with /imptoken
    getAudienceForImpCredentials(): string {
        return '';
    }

    // [OBSOLETE] to remove with /imptoken
    getIAMResourceUrl(serviceSigner: string): string {
        return '';
    }

    // [OBSOLETE] to remove with /imptoken
    getPublicKeyCertificatesUrl(): string {
        return '';
    }

    // [OBSOLETE] to remove with /imptoken
    async getServiceAccountAccessToken(): Promise<IAccessTokenModel> {
        return undefined;
    }

    async getBucketFolder(folder: string, tenantId: string, db: DynamoDB = new DynamoDB({})): Promise<string> {
        const tableName = AWSConfig.AWS_TENANT_GROUP_NAME+'-'+tenantId+'-SeismicStore.'+AWSConfig.SUBPROJECTS_KIND;
        const params = {
            TableName: tableName,
            Key: {
                'id': {S: folder}
            }
        };
        const data = await db.getItem(params).promise();
        const ret = aws.DynamoDB.Converter.unmarshall(data.Item);
        if (Object.keys(ret).length === 0){
            console.log('error to get Bucket folder: '+folder+'\n');
            return undefined;
        }
        else{
            const vars = ret['gcs_bucket'].split('$$');
            return vars[1];
        }
    }

    public async getStorageCredentials(
            tenant: string, subproject: string,
            bucket: string, readonly: boolean, _partition: string): Promise<IAccessTokenModel> {
            const dataPartition = tenant;
            const tenantId = await AWSDataEcosystemServices.getTenantIdFromPartitionID(dataPartition);

            const tenantSsmPrefix = '/osdu/tenant-groups/' + AWSConfig.AWS_TENANT_GROUP_NAME + '/tenants/' + tenantId;
            // eslint-disable-next-line @stylistic/max-len
            const s3bucket = await AWSCredentials.awsSSMHelper.getSSMParameter(tenantSsmPrefix+ '/seismic-ddms/SeismicDDMSBucket/name');
            // eslint-disable-next-line @stylistic/max-len
            const expDuration = await AWSCredentials.awsSSMHelper.getSSMParameter(tenantSsmPrefix+'/seismic-ddms/temp-cred-expiration-duration')
            let roleArn='';
            let credentials='';

            let flagUpload=true;

            const keyPath =  await this.getBucketFolder(tenant+':'+subproject, tenantId);

            const osduTenantGroupSsmPrefix = '/osdu/tenant-groups/' + AWSConfig.AWS_TENANT_GROUP_NAME;
            if(readonly ) { // readOnly True
                 // eslint-disable-next-line @stylistic/max-len
                 roleArn = await AWSCredentials.awsSSMHelper.getSSMParameter(osduTenantGroupSsmPrefix + '/seismic-ddms/iam/download-role-arn')
                flagUpload = false;
            } else   // readOnly False
            {
                // eslint-disable-next-line @stylistic/max-len
                roleArn = await AWSCredentials.awsSSMHelper.getSSMParameter(osduTenantGroupSsmPrefix + '/seismic-ddms/iam/upload-role-arn')
            }

            credentials = await this.awsSTSHelper.getCredentials(s3bucket, keyPath,roleArn,flagUpload,expDuration);

            return {
                access_token: credentials,
                expires_in: +expDuration,
                token_type: 'Bearer',
            };
    }

    // this will return serviceprincipal access token
    public static async getServiceCredentials(): Promise<string> {
        if (AWSCredentials.servicePrincipalCredential &&
            AWSCredentials.servicePrincipalCredential.expires_in > Math.floor(Date.now() / 1000)){
            return AWSCredentials.servicePrincipalCredential.access_token;
        }
        const cogNameSsm = '/osdu/instances/'+AWSConfig.OSDU_INSTANCE_NAME+'/config/cognito/name'
        const cognitoName = await AWSCredentials.awsSSMHelper.getSSMParameter(cogNameSsm);
        const tokenUrlSsmPath = '/osdu/cognito/'+cognitoName+'/oauth/token-uri';
        const oauthCustomScopeSsmPath='/osdu/cognito/'+ cognitoName+'/oauth/custom-scope';
        const clientIdSsmPath='/osdu/cognito/'+cognitoName+'/client/client-credentials/id';
        const clientSecretName='/osdu/cognito/'+cognitoName+'/client-credentials-secret';
        // pragma: allowlist nextline secret
        const clientSecretDictKey='client_credentials_client_secret'

        const clientId = await AWSCredentials.awsSSMHelper.getSSMParameter(clientIdSsmPath);
        const clientSecret = await AWSCredentials.getSecrets(clientSecretName, clientSecretDictKey);
        const tokenUrl = await AWSCredentials.awsSSMHelper.getSSMParameter(tokenUrlSsmPath);
        const oauthCustomScope = await AWSCredentials.awsSSMHelper.getSSMParameter(oauthCustomScopeSsmPath);
        const auth = clientId+':'+clientSecret;

        const encoded= (str: string):string => Buffer.from(str, 'binary').toString('base64');
        const encodedAuth = encoded(auth);

        const data = qs.stringify({
            grant_type: 'client_credentials',
            scope: oauthCustomScope
        });
        const headers = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic '+encodedAuth
            }
        };
        const url = tokenUrl;
        const results = await axios.post(url, data, headers);
        const response = results.data;
        AWSCredentials.servicePrincipalCredential = response as IAccessTokenModel;
        AWSCredentials.servicePrincipalCredential.expires_in = Math.floor(Date.now() / 1000) +
            +AWSCredentials.servicePrincipalCredential.expires_in - KExpiresMargin;
        const val = response['access_token'];
        return (Promise.resolve(val.toString()));
    }

    public static async getSecrets(
        clientSecretName: string,
        clientSecretDictKey: string,
        secretsManager:aws.SecretsManager = new aws.SecretsManager({region: AWSConfig.AWS_REGION})): Promise<string> {
        const params = {
            SecretId: clientSecretName
        };
        try {
            const data = await secretsManager.getSecretValue(params).promise();
            if (data.SecretString) {
                const secretValue = JSON.parse(data.SecretString);
                const val = Object.values(secretValue)[0];
                return (Promise.resolve(val.toString()));
            }  else {
                console.log('get binary');
                const decodedBinarySecret = Buffer.from(data.SecretBinary.toString(), 'base64').toString('ascii');
                return (Promise.resolve(decodedBinarySecret));
            }
        } catch (err) {
            console.log(err.code + ': ' + err.message);
        }
    }

}
