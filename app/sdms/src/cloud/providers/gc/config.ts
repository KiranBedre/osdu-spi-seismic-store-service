// ============================================================================
// Copyright 2017-2019, Schlumberger
// Copyright 2023 Google LLC
// Copyright 2023 EPAM Systems
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
// ============================================================================

import fs from 'fs';
import { Config, ConfigFactory } from '../../config';
import { LoggerFactory } from '../../logger';
import { Secrets } from './secrets';

@ConfigFactory.register('gc')
export class ConfigGoogle extends Config {

    // scopes
    public static GOOGLE_SCOPE_PLATFORM = 'https://www.googleapis.com/auth/cloud-platform';


    // endpoints
    public static GOOGLE_EP_IAM = 'https://iam.googleapis.com/v1';
    public static GOOGLE_EP_OAUTH2 = 'https://www.googleapis.com/oauth2/v4';
    public static GOOGLE_EP_METADATA = 'http://169.254.169.254/computeMetadata/v1';
    public static GOOGLE_EP_ROBOT = 'https://www.googleapis.com/robot/v1';
    public static GOOGLE_EP_RESOURCES = 'https://cloudresourcemanager.googleapis.com/v1';

    public static GCS_BUCKET: string;
    // System admin role (tenant provisioning required role)
    public static SEISTORE_SYSTEM_ADMIN_ROLE = 'seismic_store.system.admin';
    // DE target audience for service to service communication
    public static DES_SERVICE_TARGET_AUDIENCE: string;

    // google cloud service project id
    public static SERVICE_CLOUD_PROJECT: string;

    // Service identities Configurations
    public static SERVICE_IDENTITY_KEY_FILENAME: string;
    public static SERVICE_IDENTITY_EMAIL: string;
    public static SERVICE_IDENTITY_PRIVATE_KEY: string;
    public static SERVICE_IDENTITY_PRIVATE_KEY_ID: string;

    // Apis base url path
    public static API_VERSION = 'v3';
    public static API_BASE_URL_PATH = '/api/' + ConfigGoogle.API_VERSION;

    // max len for a group name in DE
    public static DES_GROUP_CHAR_LIMIT = 128;

    // pubsub topic
    public static PUBSUBTOPIC: string;

    // Entitlement Base Path
    public static ENTITLEMENT_BASE_URL_PATH: string;

    // Data partition header key
    public static DATA_PARTITION_REST_HEADER_KEY: string;

    // service auth provider and credentials (optional)
    // The google workload identity is used to interact with GCP solutions like datastore/gcs/log/etc...
    // This account, if set, can be used to sign an impersonation token credential.
    // This account, if set, can be used to perform Auth Operations like credentials exchange.
    // Introduced because different auth providers can be used on a CSP deployment
    // This variable should be a serialized json containing id/secrets/etc...
    // The decoding policy is defined in the src/auth/auth.ts and src/auth/providers/*
    public static SERVICE_AUTH_PROVIDER_CREDENTIAL: string;
    // This id build the auth provider in the abstraction implemented in src/auth/providers/*
    public static SERVICE_AUTH_PROVIDER: string;

    // correlation id
    public static CORRELATION_ID = 'correlation-id';

    public async init(): Promise<void> {

        try {
            Config.USER_ID_FROM_PROVIDER_API = process.env.USER_ID_FROM_ENTITLEMENTS === 'true';
            ConfigGoogle.GCS_BUCKET = process.env.GCS_BUCKET;
            // load des target audience for service to service communication
            ConfigGoogle.DES_SERVICE_TARGET_AUDIENCE = process.env.SEISTORE_DES_TARGET_AUDIENCE;

            // set the google cloud service project id
            ConfigGoogle.SERVICE_CLOUD_PROJECT = process.env.SERVICE_CLOUD_PROJECT;

            // set the base service path
            ConfigGoogle.API_BASE_URL_PATH = process.env.API_BASE_URL_PATH || ConfigGoogle.API_BASE_URL_PATH;

            // load service identity from credential file (for local dev - on cloud use work-load identities)
            ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME = process.env.SERVICE_IDENTITY_KEY_FILENAME;
            if (ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME) {
                const data = JSON.parse(fs.readFileSync(ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME).toString());
                ConfigGoogle.SERVICE_IDENTITY_EMAIL = data.client_email;
                ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY = data.private_key;
                ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY_ID = data.private_key_id;
            }

            ConfigGoogle.ENTITLEMENT_BASE_URL_PATH = process.env.ENTITLEMENT_BASE_URL_PATH || '/entitlements/v2';
            ConfigGoogle.DATA_PARTITION_REST_HEADER_KEY = process.env.DATA_PARTITION_REST_HEADER_KEY || 'data-partition-id'; // to-fix
            ConfigGoogle.PUBSUBTOPIC = process.env.PUBSUBTOPIC !== undefined ? process.env.PUBSUBTOPIC : 'subproject-operations';

            // read the optional auth provider id and secret
            ConfigGoogle.SERVICE_AUTH_PROVIDER = process.env.SERVICE_AUTH_PROVIDER;
            ConfigGoogle.SERVICE_AUTH_PROVIDER_CREDENTIAL = await new Secrets().getSecret(
                'sdms-svc-auth-provider-credential', false);

            // set the correlation id
            ConfigGoogle.CORRELATION_ID = process.env.CORRELATION_ID || ConfigGoogle.CORRELATION_ID;

            await Config.initServiceConfiguration({
                SERVICE_ENV: process.env.APP_ENVIRONMENT_IDENTIFIER || '',
                SERVICE_PORT: +process.env.PORT || 5000,
                API_BASE_PATH: ConfigGoogle.API_BASE_URL_PATH,
                IMP_SERVICE_ACCOUNT_SIGNER: process.env.IMP_SERVICE_ACCOUNT_SIGNER || '',
                LOCKSMAP_REDIS_INSTANCE_ADDRESS: process.env.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                LOCKSMAP_REDIS_INSTANCE_PORT: +process.env.LOCKSMAP_REDIS_INSTANCE_PORT,
                LOCKSMAP_REDIS_INSTANCE_KEY: process.env.LOCKSMAP_REDIS_INSTANCE_KEY,
                DES_REDIS_INSTANCE_ADDRESS: process.env.DES_REDIS_INSTANCE_ADDRESS,
                DES_REDIS_INSTANCE_PORT: +process.env.DES_REDIS_INSTANCE_PORT,
                DES_REDIS_INSTANCE_KEY: process.env.DES_REDIS_INSTANCE_KEY,
                DES_SERVICE_HOST_COMPLIANCE: process.env.DES_SERVICE_HOST_COMPLIANCE || process.env.SEISTORE_DES_HOST,
                DES_SERVICE_HOST_ENTITLEMENT: process.env.DES_SERVICE_HOST_ENTITLEMENT || process.env.SEISTORE_DES_HOST,
                DES_SERVICE_HOST_STORAGE: process.env.DES_SERVICE_HOST_STORAGE || process.env.SEISTORE_DES_HOST,
                DES_SERVICE_HOST_PARTITION: process.env.DES_SERVICE_HOST_PARTITION || process.env.SEISTORE_DES_HOST,
                DES_POLICY_SERVICE_HOST: process.env.DES_POLICY_SERVICE_HOST || process.env.SEISTORE_DES_HOST,
                DES_ENTITLEMENT_DELETE_ENDPOINT_PATH: '/groups/data/',
                DES_SERVICE_APPKEY: process.env.SEISTORE_DES_APPKEY || '',
                DES_GROUP_CHAR_LIMIT: ConfigGoogle.DES_GROUP_CHAR_LIMIT,
                JWKS_URL: process.env.JWKS_URL,
                JWT_EXCLUDE_PATHS: process.env.JWT_EXCLUDE_PATHS,
                JWT_AUDIENCE: process.env.JWT_AUDIENCE,
                JWT_ENABLE_FEATURE: process.env.JWT_ENABLE_FEATURE ? process.env.JWT_ENABLE_FEATURE === 'true' : false,
                ENFORCE_SCHEMA_BY_KEY: true,
                CORRELATION_ID: ConfigGoogle.CORRELATION_ID,
                SERVICE_AUTH_PROVIDER: ConfigGoogle.SERVICE_AUTH_PROVIDER,
                SERVICE_AUTH_PROVIDER_CREDENTIAL: ConfigGoogle.SERVICE_AUTH_PROVIDER_CREDENTIAL,
                ENABLE_SDMS_ID_AUDIENCE_CHECK: process.env.ENABLE_SDMS_ID_AUDIENCE_CHECK !== undefined ?
                    process.env.ENABLE_SDMS_ID_AUDIENCE_CHECK === 'true' : false,
                ENABLE_DE_TOKEN_EXCHANGE: process.env.ENABLE_DE_TOKEN_EXCHANGE !== undefined ?
                    process.env.ENABLE_DE_TOKEN_EXCHANGE === 'true' : false,
                DES_TARGET_AUDIENCE: process.env.DES_TARGET_AUDIENCE,
                TENANT_JOURNAL_ON_DATA_PARTITION: false,
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
                FEATURE_FLAG_POLICY_SVC_INTERACTION: process.env.FEATURE_FLAG_POLICY_SVC_INTERACTION === 'true',
                CCM_SERVICE_URL: process.env.CCM_SERVICE_URL,
                CCM_TOKEN_SCOPE: process.env.CCM_TOKEN_SCOPE,
                CALLER_FORWARD_HEADERS: process.env.CALLER_FORWARD_HEADERS ?
                    process.env.CALLER_FORWARD_HEADERS + ',' + ConfigGoogle.CORRELATION_ID :
                    ConfigGoogle.CORRELATION_ID,
                USER_ID_CLAIM_FOR_SDMS: process.env.USER_ID_CLAIM_FOR_SDMS ? process.env.USER_ID_CLAIM_FOR_SDMS : 'subid',
                USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC: process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC ?
                    process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC : 'email',
                USER_ASSOCIATION_SVC_PROVIDER: process.env.USER_ASSOCIATION_SVC_PROVIDER ?
                    process.env.USER_ASSOCIATION_SVC_PROVIDER
                    : 'ccm-internal',
                SDMS_PREFIX: process.env.SDMS_PREFIX ? process.env.SDMS_PREFIX : '/seistore-svc/api/v3'
            });

        }
        catch (error) {
            LoggerFactory.build(Config.CLOUDPROVIDER).error('Unable to initialize configuration for Google Cloud provider');
            throw error;
        }

    }

}
