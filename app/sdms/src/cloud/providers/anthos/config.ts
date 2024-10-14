// Copyright 2022 Google LLC
// Copyright 2022 EPAM Systems
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

import process from 'process';
import { Config, ConfigFactory } from '../../config';


@ConfigFactory.register('anthos')
export class AnthosConfig extends Config {
    // scopes
    public static KEYCLOAK_CLIENT_ID: string;
    public static KEYCLOAK_CLIENT_SECRET: string;
    public static KEYCLOAK_URL: string;
    public static MINIO_ACCESS_KEY: string;
    public static MINIO_SECRET_KEY: string;
    public static MINIO_ENDPOINT: string;
    public static SDMS_BUCKET: string;
    // Logger
    public static LOGGER_LEVEL: string;
    // max len for a group name in DE
    public static DES_GROUP_CHAR_LIMIT = 256;

    public async init(): Promise<void> {


        // init Anthos specific configurations
        AnthosConfig.KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID;
        AnthosConfig.KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;
        AnthosConfig.KEYCLOAK_URL = process.env.KEYCLOAK_URL;

        AnthosConfig.MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
        AnthosConfig.MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
        AnthosConfig.MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
        AnthosConfig.SDMS_BUCKET = process.env.SDMS_BUCKET;
        AnthosConfig.DES_REDIS_INSTANCE_TLS_DISABLE = process.env.DES_REDIS_INSTANCE_TLS_DISABLE === 'true';

        // Logger
        AnthosConfig.LOGGER_LEVEL = process.env.LOGGER_LEVEL || 'info';

        await Config.initServiceConfiguration({
            SERVICE_ENV: process.env.SERVICE_ENV,
            SERVICE_PORT: +process.env.PORT || 5000,
            API_BASE_PATH: process.env.API_BASE_PATH || '/api/seismic-store/v3',
            IMP_SERVICE_ACCOUNT_SIGNER: process.env.IMP_SERVICE_ACCOUNT_SIGNER || '',
            LOCKSMAP_REDIS_INSTANCE_ADDRESS: process.env.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
            LOCKSMAP_REDIS_INSTANCE_PORT: +process.env.LOCKSMAP_REDIS_INSTANCE_PORT,
            LOCKSMAP_REDIS_INSTANCE_KEY: process.env.LOCKSMAP_REDIS_INSTANCE_KEY || '',
            LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE: process.env.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE === 'true',
            DES_SERVICE_HOST_COMPLIANCE: process.env.DES_SERVICE_HOST_COMPLIANCE,
            DES_SERVICE_HOST_ENTITLEMENT: process.env.DES_SERVICE_HOST_ENTITLEMENT,
            DES_SERVICE_HOST_STORAGE: process.env.DES_SERVICE_HOST_STORAGE,
            DES_SERVICE_HOST_PARTITION: process.env.DES_SERVICE_HOST_PARTITION,
            DES_SERVICE_APPKEY: process.env.DES_SERVICE_APPKEY || '',
            DES_GROUP_CHAR_LIMIT: AnthosConfig.DES_GROUP_CHAR_LIMIT,
            TENANT_JOURNAL_ON_DATA_PARTITION: true,
            SSL_ENABLED: process.env.SSL_ENABLED === 'true',
            SSL_KEY_PATH: process.env.SSL_KEY_PATH,
            SSL_CERT_PATH: process.env.SSL_CERT_PATH,
            FEATURE_FLAG_SEISMICMETA_STORAGE: process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== undefined ?
                process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== 'false' : true,
            FEATURE_FLAG_IMPTOKEN: process.env.FEATURE_FLAG_IMPTOKEN !== undefined ?
                process.env.FEATURE_FLAG_IMPTOKEN !== 'false' : true,
            FEATURE_FLAG_TRACE: process.env.FEATURE_FLAG_TRACE !== undefined ?
                process.env.FEATURE_FLAG_TRACE !== 'false' : true,
            FEATURE_FLAG_LOGGING: process.env.FEATURE_FLAG_LOGGING !== undefined ?
                process.env.FEATURE_FLAG_LOGGING !== 'false' : true,
            FEATURE_FLAG_STACKDRIVER_EXPORTER: process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== undefined ?
                process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== 'false' : true,
            FEATURE_FLAG_CCM_INTERACTION: process.env.FEATURE_FLAG_CCM_INTERACTION ?
                process.env.FEATURE_FLAG_CCM_INTERACTION === 'true' : false,
            CCM_SERVICE_URL: process.env.CCM_SERVICE_URL || '',
            CCM_TOKEN_SCOPE: process.env.CCM_TOKEN_SCOPE || '',
            CALLER_FORWARD_HEADERS: process.env.CALLER_FORWARD_HEADERS,
            USER_ID_CLAIM_FOR_SDMS: process.env.USER_ID_CLAIM_FOR_SDMS ? process.env.USER_ID_CLAIM_FOR_SDMS : 'subid',
            USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC: process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC ?
                process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC : 'email',
            USER_ASSOCIATION_SVC_PROVIDER: process.env.USER_ASSOCIATION_SVC_PROVIDER,
            SDMS_PREFIX: process.env.SDMS_PREFIX  || '/api/seismic-store/v3',
            DES_POLICY_SERVICE_HOST: process.env.DES_POLICY_SERVICE_HOST || process.env.DES_SERVICE_HOST,
            FEATURE_FLAG_POLICY_SVC_INTERACTION: process.env.FEATURE_FLAG_POLICY_SVC_INTERACTION === 'true'
        });
    }

}
