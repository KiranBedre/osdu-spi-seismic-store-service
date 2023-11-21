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
import axios from 'axios';
import qs from 'qs';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { AwsSecrets } from './secrets';
const KExpiresMargin = 300; // 5 minutes

@CredentialsFactory.register('aws')
export class AWSCredentials extends AbstractCredentials {

    private static awsSSMHelper = new AWSSSMhelper();
    private awsSTSHelper = new AWSSTShelper();
    private static secretsManager = new SecretsManagerClient({ region: AWSConfig.AWS_REGION });
    private static servicePrincipalCredential: IAccessTokenModel = {
        access_token: undefined,
        expires_in: 0,
        token_type: undefined
    };
    private static expDuration = null;


    public async getStorageCredentials(
        bucket: string, readonly: boolean, partition: string): Promise<IAccessTokenModel> {
                  
        const tenantId = await AwsSecrets.getTenantIdFromPartitionID(partition);
        const s3bucket = await AwsSecrets.getBucketFromPartitionID(partition);
        
        const tenantSsmPrefix = '/osdu/tenant-groups/' + AWSConfig.AWS_TENANT_GROUP_NAME + '/tenants/' + tenantId;
        
        if (AWSCredentials.expDuration == null) {
            AWSCredentials.expDuration = await AWSCredentials.awsSSMHelper.getSSMParameter(tenantSsmPrefix + '/seismic-ddms-v4/temp-cred-expiration-duration')
        }
        let roleArn = '';
        let credentials='';

        let flagUpload=true;

        const osduTenantGroupSsmPrefix = '/osdu/tenant-groups/' + AWSConfig.AWS_TENANT_GROUP_NAME;
        // tslint:disable-next-line:triple-equals
        if(readonly ) { // readOnly True
                roleArn = await AWSCredentials.awsSSMHelper.getSSMParameter(osduTenantGroupSsmPrefix + '/seismic-ddms-v4/iam/download-role-arn')
            flagUpload = false;
        } else   // readOnly False
        {
            roleArn = await AWSCredentials.awsSSMHelper.getSSMParameter(osduTenantGroupSsmPrefix + '/seismic-ddms-v4/iam/upload-role-arn')
            flagUpload = true;
        }

        credentials = await this.awsSTSHelper.getCredentials(s3bucket, partition+'/'+bucket,roleArn,flagUpload,AWSCredentials.expDuration);

        const result = {
            access_token: credentials,
            expires_in: +AWSCredentials.expDuration,
            token_type: 'unsignedurl: '+'s3://' + s3bucket + '/' + partition + '/'+bucket,
        };
        return result;
    }

    // this will return serviceprincipal access token
    public async getServiceCredentials(): Promise<string> {
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

        const clientId = await AWSCredentials.awsSSMHelper.getSSMParameter(clientIdSsmPath);
        const clientSecret = await AWSCredentials.getSecrets(clientSecretName);
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

    public static async getSecrets(clientSecretName: string): Promise<string> {
        const params = {
            SecretId: clientSecretName
        };
        
        try {
            const data = await this.secretsManager.send(new GetSecretValueCommand({ SecretId: params.SecretId }));
            if (data.SecretString) {
                const secretValue = JSON.parse(data.SecretString);
                const val = Object.values(secretValue)[0];
                return (Promise.resolve(val.toString()));
            } else {
                // tslint:disable-next-line:no-console
                console.log('get binary');
                const decodedBinarySecret = Buffer.from(data.SecretBinary.toString(), 'base64').toString('ascii');
                return (Promise.resolve(decodedBinarySecret));
            }
        } catch (err) {
            // tslint:disable-next-line:no-console
            console.log(err.code + ': ' + err.message);
        }
    }

}
