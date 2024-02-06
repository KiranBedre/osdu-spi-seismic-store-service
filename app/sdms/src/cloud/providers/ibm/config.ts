/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import { Config, ConfigFactory } from '../../config';
import { config } from './logger';

@ConfigFactory.register('ibm')
export class IbmConfig extends Config {

    // Apis base url path
    public static API_VERSION = 'v3';
    public static API_BASE_URL_PATH = '/api/' + IbmConfig.API_VERSION;

    // max len for a group name in DE
    public static DES_GROUP_CHAR_LIMIT = 256;

    // env
    public static IBM_ENVIRONMENT: string;
    public static IBM_REGION: string;

    // IBM COS
    public static COS_ACCESS_KEY_ID: string;
    public static COS_SECRET_ACCESS_KEY: string;
    public static COS_ENDPOINT: string;
    public static COS_S3_FORCEPATHSTYLE: boolean;
    public static COS_SIGNATUREVERSION: string;
    public static COS_SUBUSER_ACCESS_KEY_ID: string;
    public static COS_SUBUSER_SECRET_ACCESS_KEY: string;
    public static COS_TEMP_CRED_EXPIRY: string;
    public static COS_ROLE_ARN: string;
    public static COS_ROLE_SESSION_NAME: string;

    // IBM KeyCloak
    public static KEYCLOAK_BASEURL: string;
    public static KEYCLOAK_URL_TOKEN: string;
    public static KEYCLOAK_REALM: string;
    public static KEYCLOAK_USERNAME: string;
    public static KEYCLOAK_PASSWORD: string;
    public static KEYCLOAK_GRANTTYPE: string;
    public static KEYCLOAK_CLIENTID: string;
    public static KEYCLOAK_CLIENTSECRET: string;

    // IBM Document DB
    public static DOC_DB_URL: string;
    public static DOC_DB_COLLECTION: string;
    public static DOC_DB_QUERY_RESULT_LIMIT: string;
    public static DOC_DB_QUERY_RESULT_LIMIT_VALUE: number;
    public static DOC_DB_QUERY_SELECT_FIELDS: string;

    // SERVICES
    public static ENTITLEMENT_HOST: string;
    public static LEGAL_HOST: string;
    public static STORAGE_HOST: string;

    // Logger
    public static LOGGER_LEVEL: string;

    // DES context path
    public static ENTITLEMENT_CONTEXT_PATH: string;
    public static COMPLIANCE_CONTEXT_PATH: string;
    public static STORAGE_CONTEXT_PATH: string;
    public static POLICY_SVC_CONTEXT_PATH: string;

    // list of caller headers to forward to downstream service call (DE Core Service like entitlement/storage...)
    // if specified the default forwarded headers list will be override. (ref, https://www.npmjs.com/package/hpropagate)
    // provided as comma separated strings
    public static CALLER_FORWARD_HEADERS: string;

    public async init(): Promise<void> {

        // data ecosystem host url and appkey
        IbmConfig.DES_SERVICE_HOST_COMPLIANCE = process.env.DES_SERVICE_HOST_COMPLIANCE;
        IbmConfig.DES_SERVICE_HOST_ENTITLEMENT = process.env.DES_SERVICE_HOST_ENTITLEMENT;
        IbmConfig.DES_SERVICE_HOST_STORAGE = process.env.DES_SERVICE_HOST_STORAGE;
        IbmConfig.IMP_SERVICE_ACCOUNT_SIGNER = process.env.IMP_SERVICE_ACCOUNT_SIGNER;
        IbmConfig.CCM_SERVICE_URL = process.env.CCM_SERVICE_URL;

        // caller forwarded headers to the downstream service
        IbmConfig.CALLER_FORWARD_HEADERS = process.env.CALLER_FORWARD_HEADERS;

        // DES service context path
        IbmConfig.ENTITLEMENT_CONTEXT_PATH = process.env.ENTITLEMENT_CONTEXT_PATH;
        IbmConfig.COMPLIANCE_CONTEXT_PATH = process.env.COMPLIANCE_CONTEXT_PATH;
        IbmConfig.STORAGE_CONTEXT_PATH = process.env.STORAGE_CONTEXT_PATH;
        IbmConfig.POLICY_SVC_CONTEXT_PATH = process.env.POLICY_SVC_CONTEXT_PATH || '/api/policy/v1';

        // DES_SERVICE_HOST replaced by new variable ENTITLEMENT_HOST
        IbmConfig.ENTITLEMENT_HOST = process.env.ENTITLEMENT_HOST;
        IbmConfig.LEGAL_HOST = process.env.LEGAL_HOST;// DES_SERVICE_HOST replaced by new variable LEGAL_HOST
        IbmConfig.STORAGE_HOST = process.env.STORAGE_HOST;// DES_SERVICE_HOST replaced by new variable LEGAL_HOST

        // IBM COS
        IbmConfig.COS_ACCESS_KEY_ID = process.env.COS_ACCESS_KEY_ID;
        IbmConfig.COS_SECRET_ACCESS_KEY = process.env.COS_SECRET_ACCESS_KEY;
        IbmConfig.COS_ENDPOINT = process.env.COS_ENDPOINT;
        IbmConfig.COS_S3_FORCEPATHSTYLE = process.env.COS_S3_FORCEPATHSTYLE === 'true';// string to boolean
        IbmConfig.COS_SIGNATUREVERSION = process.env.COS_SIGNATUREVERSION;
        IbmConfig.COS_SUBUSER_ACCESS_KEY_ID = process.env.COS_SUBUSER_ACCESS_KEY_ID;
        IbmConfig.COS_SUBUSER_SECRET_ACCESS_KEY = process.env.COS_SUBUSER_SECRET_ACCESS_KEY;
        IbmConfig.COS_TEMP_CRED_EXPIRY = process.env.COS_TEMP_CRED_EXPIRY || '3600';
        IbmConfig.COS_ROLE_ARN = process.env.COS_ROLE_ARN || 'arn:aws:iam:::role/osdurolearn';
        IbmConfig.COS_ROLE_SESSION_NAME = process.env.COS_ROLE_SESSION_NAME || 'Bob';

        // IBM Keycloak
        IbmConfig.KEYCLOAK_BASEURL = process.env.KEYCLOAK_BASEURL;
        IbmConfig.KEYCLOAK_URL_TOKEN = process.env.KEYCLOAK_URL_TOKEN;
        IbmConfig.KEYCLOAK_USERNAME = process.env.KEYCLOAK_USERNAME;
        IbmConfig.KEYCLOAK_PASSWORD = process.env.KEYCLOAK_PASSWORD;
        IbmConfig.KEYCLOAK_GRANTTYPE = process.env.KEYCLOAK_GRANTTYPE;
        IbmConfig.KEYCLOAK_CLIENTID = process.env.KEYCLOAK_CLIENTID;
        IbmConfig.KEYCLOAK_CLIENTSECRET = process.env.KEYCLOAK_CLIENTSECRET;
        IbmConfig.KEYCLOAK_REALM = process.env.KEYCLOAK_REALM;

        // IBM Document DB
        IbmConfig.DOC_DB_URL = process.env.DB_URL;
        IbmConfig.DOC_DB_COLLECTION = process.env.DOC_DB_COLLECTION;
        IbmConfig.DOC_DB_QUERY_SELECT_FIELDS = process.env.DOC_DB_QUERY_SELECT_FIELDS;
        IbmConfig.DOC_DB_QUERY_RESULT_LIMIT = process.env.DOC_DB_QUERY_RESULT_LIMIT;
        IbmConfig.DOC_DB_QUERY_RESULT_LIMIT_VALUE = parseInt(process.env.DOC_DB_QUERY_RESULT_LIMIT_VALUE, 10);

        IbmConfig.DES_SERVICE_APPKEY = 'na';
        Config.checkRequiredConfig(IbmConfig.DES_SERVICE_HOST_COMPLIANCE, 'DES_SERVICE_HOST_COMPLIANCE');
        Config.checkRequiredConfig(IbmConfig.DES_SERVICE_HOST_ENTITLEMENT, 'DES_SERVICE_HOST_ENTITLEMENT');
        Config.checkRequiredConfig(IbmConfig.DES_SERVICE_HOST_STORAGE, 'DES_SERVICE_HOST_STORAGE');
        Config.checkRequiredConfig(IbmConfig.DES_SERVICE_APPKEY, 'DES_SERVICE_APPKEY');

        // redis cache port for locks (the port as env variable)
        IbmConfig.LOCKSMAP_REDIS_INSTANCE_PORT = +process.env.REDIS_INSTANCE_PORT;
        IbmConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS = process.env.LOCKSMAP_REDIS_INSTANCE_ADDRESS;
        IbmConfig.LOCKSMAP_REDIS_INSTANCE_KEY = process.env.LOCKSMAP_REDIS_INSTANCE_KEY;
        IbmConfig.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE = process.env.CACHE_TLS_DISABLE ? true : false;

        IbmConfig.DES_REDIS_INSTANCE_ADDRESS = process.env.DES_REDIS_INSTANCE_ADDRESS;
        IbmConfig.DES_REDIS_INSTANCE_PORT = +process.env.DES_REDIS_INSTANCE_PORT;
        IbmConfig.DES_REDIS_INSTANCE_KEY = process.env.DES_REDIS_INSTANCE_KEY;
        IbmConfig.DES_REDIS_INSTANCE_TLS_DISABLE = process.env.CACHE_TLS_DISABLE ? true : false;

        // Logger
        IbmConfig.LOGGER_LEVEL = process.env.LOGGER_LEVEL || 'debug';

        Config.checkRequiredConfig(IbmConfig.LOCKSMAP_REDIS_INSTANCE_PORT, 'REDIS_INSTANCE_PORT');
        Config.ENABLE_SEARCH_AND_SELECT_CRITERIA_IN_LIST = true;
        // init generic configurations
        await Config.initServiceConfiguration({
            SERVICE_ENV: process.env.APP_ENVIRONMENT_IDENTIFIER,
            SERVICE_PORT: +process.env.PORT || 5000,
            API_BASE_PATH: IbmConfig.API_BASE_URL_PATH,
            IMP_SERVICE_ACCOUNT_SIGNER: IbmConfig.IMP_SERVICE_ACCOUNT_SIGNER,
            LOCKSMAP_REDIS_INSTANCE_ADDRESS: IbmConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
            LOCKSMAP_REDIS_INSTANCE_PORT: IbmConfig.LOCKSMAP_REDIS_INSTANCE_PORT,
            LOCKSMAP_REDIS_INSTANCE_KEY: IbmConfig.LOCKSMAP_REDIS_INSTANCE_KEY,
            LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE: IbmConfig.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE,
            DES_REDIS_INSTANCE_ADDRESS: IbmConfig.DES_REDIS_INSTANCE_ADDRESS,
            DES_REDIS_INSTANCE_PORT: IbmConfig.DES_REDIS_INSTANCE_PORT,
            DES_REDIS_INSTANCE_KEY: IbmConfig.DES_REDIS_INSTANCE_KEY,
            DES_REDIS_INSTANCE_TLS_DISABLE: IbmConfig.DES_REDIS_INSTANCE_TLS_DISABLE,
            DES_SERVICE_HOST_COMPLIANCE: IbmConfig.DES_SERVICE_HOST_COMPLIANCE,
            DES_SERVICE_HOST_ENTITLEMENT: IbmConfig.DES_SERVICE_HOST_ENTITLEMENT,
            DES_SERVICE_HOST_STORAGE: IbmConfig.DES_SERVICE_HOST_STORAGE,
            DES_SERVICE_HOST_PARTITION: 'TO DEFINE',
            DES_SERVICE_APPKEY: IbmConfig.DES_SERVICE_APPKEY,
            DES_GROUP_CHAR_LIMIT: IbmConfig.DES_GROUP_CHAR_LIMIT,
            JWKS_URL: process.env.JWKS_URL,
            JWT_EXCLUDE_PATHS: process.env.JWT_EXCLUDE_PATHS,
            JWT_AUDIENCE: process.env.JWT_AUDIENCE,
            JWT_ENABLE_FEATURE: process.env.JWT_ENABLE_FEATURE ? process.env.JWT_ENABLE_FEATURE === 'true' : false,
            TENANT_JOURNAL_ON_DATA_PARTITION: true,
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
            FEATURE_FLAG_CCM_INTERACTION: process.env.FEATURE_FLAG_CCM_INTERACTION === 'true',
            FEATURE_FLAG_POLICY_SVC_INTERACTION: process.env.FEATURE_FLAG_POLICY_SVC_INTERACTION === 'true',
            CCM_SERVICE_URL: process.env.CCM_SERVICE_URL,
            CCM_TOKEN_SCOPE: process.env.CCM_TOKEN_SCOPE,
            CALLER_FORWARD_HEADERS: process.env.CALLER_FORWARD_HEADERS,
            USER_ID_CLAIM_FOR_SDMS: process.env.USER_ID_CLAIM_FOR_SDMS ? process.env.USER_ID_CLAIM_FOR_SDMS : 'subid',
            USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC: process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC ?
                process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC : 'email',
            USER_ASSOCIATION_SVC_PROVIDER: process.env.USER_ASSOCIATION_SVC_PROVIDER,
            SDMS_PREFIX: process.env.SDMS_PREFIX ? process.env.SDMS_PREFIX : '/seistore-svc/api/v3',
            DES_POLICY_SERVICE_HOST: process.env.DES_POLICY_SERVICE_HOST || process.env.DES_SERVICE_HOST
        });

        config();

    }

}
