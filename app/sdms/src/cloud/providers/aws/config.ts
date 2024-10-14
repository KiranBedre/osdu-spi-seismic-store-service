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

import { Config, ConfigFactory } from '../../config';
import { AWSSSMhelper } from './ssmhelper';
import * as f from 'fs';
import path from 'path';

@ConfigFactory.register('aws')
export class AWSConfig extends Config {
    // scopes
    public static AWS_EP_OAUTH2: string;
    public static AWS_EP_IAM: string;
    public static AWS_REGION: string;
    public static OSDU_INSTANCE_NAME: string;
    public static AWS_TENANT_GROUP_NAME: string;
    // Logger
    public static LOGGER_LEVEL: string;
    // max len for a group name in DE
    public static DES_GROUP_CHAR_LIMIT = 256;

    public async init(): Promise<void> {

        // init AWS specific configurations
        AWSConfig.AWS_EP_OAUTH2 = process.env.WS_EP_OAUTH2;
        AWSConfig.AWS_EP_IAM = process.env.AWS_EP_IAM;
        AWSConfig.AWS_REGION = process.env.AWS_REGION;
        AWSConfig.OSDU_INSTANCE_NAME = process.env.OSDU_INSTANCE_NAME;
        const awsSSMHelper = new AWSSSMhelper();
        AWSConfig.AWS_TENANT_GROUP_NAME = await awsSSMHelper.getSSMParameter(
            '/osdu/instances/' + AWSConfig.OSDU_INSTANCE_NAME + '/config/tenant-group/name');
        // Logger
        AWSConfig.LOGGER_LEVEL = process.env.LOGGER_LEVEL || 'info';

        // read from files
        const fileLocation = process.env.PARAMETER_MOUNT_PATH
        const keyFile = path.join(fileLocation, 'LOCKSMAP_REDIS_INSTANCE_KEY');
        const keyData = f.readFileSync(keyFile).toString();
        const keyContent = JSON.parse(keyData).token;
        const addressFile = path.join(fileLocation, 'LOCKSMAP_REDIS_INSTANCE_ADDRESS');
        const addressContent = f.readFileSync(addressFile).toString();
        const portFile = path.join(fileLocation, 'LOCKSMAP_REDIS_INSTANCE_PORT');
        const portContent = f.readFileSync(portFile).toString();

        const port = +process.env.PORT || 5000;
        const impServiceAccountSigner = process.env.IMP_SERVICE_ACCOUNT_SIGNER || '';
        const desServiceAppkey = process.env.DES_SERVICE_APPKEY || '';
        const sslEnabled = process.env.SSL_ENABLED === 'true';
        const featureFlagSeismicmetaStorage = process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== undefined ?
            process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== 'false' : true;
        const featureFlagImptoken = process.env.FEATURE_FLAG_IMPTOKEN !== undefined ?
            process.env.FEATURE_FLAG_IMPTOKEN !== 'false' : true;
        const featureFlagTrace = process.env.FEATURE_FLAG_TRACE !== undefined ? process.env.FEATURE_FLAG_TRACE !== 'false' : true;
        const featureFlagLogging = process.env.FEATURE_FLAG_LOGGING !== undefined ? process.env.FEATURE_FLAG_LOGGING !== 'false' : true;
        const featureFlagStackdriverExporter = process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== undefined ?
            process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== 'false' : true;
        const featureFlagCcmIntegration = process.env.FEATURE_FLAG_CCM_INTERACTION ?
            process.env.FEATURE_FLAG_CCM_INTERACTION === 'true' : false;
        const featureFlagPolicySvcInteraction = process.env.FEATURE_FLAG_POLICY_SVC_INTERACTION === 'true';
        const CcmServiceUrl = process.env.CCM_SERVICE_URL || '';
        const CcmTokenScope = process.env.CCM_TOKEN_SCOPE || '';
        const userIdClaimForSdms = process.env.USER_ID_CLAIM_FOR_SDMS ? process.env.USER_ID_CLAIM_FOR_SDMS : 'subid';
        const userIdClaimForEntitlementsSvc = process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC ?
            process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC : 'email';
        const sdmsPrefix = process.env.SDMS_PREFIX ? process.env.SDMS_PREFIX : '/seistore-svc/api/v3';
        const desPolicyServiceHost = process.env.DES_POLICY_SERVICE_HOST || process.env.DES_SERVICE_HOST;

        await Config.initServiceConfiguration({
            SERVICE_ENV: process.env.SERVICE_ENV,
            SERVICE_PORT: port,
            API_BASE_PATH: process.env.API_BASE_PATH,
            IMP_SERVICE_ACCOUNT_SIGNER: impServiceAccountSigner,
            LOCKSMAP_REDIS_INSTANCE_ADDRESS: addressContent,
            LOCKSMAP_REDIS_INSTANCE_PORT: +portContent,
            LOCKSMAP_REDIS_INSTANCE_KEY: keyContent,
            DES_REDIS_INSTANCE_ADDRESS: addressContent,
            DES_REDIS_INSTANCE_PORT: +portContent,
            DES_REDIS_INSTANCE_KEY: keyContent,
            DES_SERVICE_HOST_COMPLIANCE: process.env.LEGAL_BASE_URL,
            DES_SERVICE_HOST_ENTITLEMENT: process.env.ENTITLEMENTS_BASE_URL,
            DES_SERVICE_HOST_STORAGE: process.env.STORAGE_BASE_URL,
            DES_SERVICE_HOST_PARTITION: process.env.PARTITION_BASE_URL,
            DES_SERVICE_APPKEY: desServiceAppkey,
            DES_GROUP_CHAR_LIMIT: AWSConfig.DES_GROUP_CHAR_LIMIT,
            TENANT_JOURNAL_ON_DATA_PARTITION: true,
            SSL_ENABLED: sslEnabled,
            SSL_KEY_PATH: process.env.SSL_KEY_PATH,
            SSL_CERT_PATH: process.env.SSL_CERT_PATH,
            FEATURE_FLAG_SEISMICMETA_STORAGE: featureFlagSeismicmetaStorage,
            FEATURE_FLAG_IMPTOKEN: featureFlagImptoken,
            FEATURE_FLAG_TRACE: featureFlagTrace,
            FEATURE_FLAG_LOGGING: featureFlagLogging,
            FEATURE_FLAG_STACKDRIVER_EXPORTER: featureFlagStackdriverExporter,
            FEATURE_FLAG_CCM_INTERACTION: featureFlagCcmIntegration,
            FEATURE_FLAG_POLICY_SVC_INTERACTION: featureFlagPolicySvcInteraction,
            CCM_SERVICE_URL: CcmServiceUrl,
            CCM_TOKEN_SCOPE: CcmTokenScope,
            CALLER_FORWARD_HEADERS: process.env.CALLER_FORWARD_HEADERS,
            USER_ID_CLAIM_FOR_SDMS: userIdClaimForSdms,
            USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC: userIdClaimForEntitlementsSvc,
            USER_ASSOCIATION_SVC_PROVIDER: process.env.USER_ASSOCIATION_SVC_PROVIDER,
            SDMS_PREFIX: sdmsPrefix,
            DES_POLICY_SERVICE_HOST: desPolicyServiceHost
        });
    }

}
