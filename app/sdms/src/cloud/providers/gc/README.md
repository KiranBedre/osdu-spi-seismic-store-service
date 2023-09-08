## Environment variables

|Variable|Example|Comments|
|-----|-----|------|
|CLOUDPROVIDER |gc||
|DATA_PARTITION_REST_HEADER_KEY |data-partition-id||
|DES_REDIS_INSTANCE_PORT |6379||
|DES_SERVICE_HOST_COMPLIANCE |<http://legal>||
|DES_SERVICE_HOST_ENTITLEMENT |<http://entitlements>||
|DES_SERVICE_HOST_PARTITION |<http://partition>||
|DES_SERVICE_HOST_STORAGE |<http://storage>||
|DES_REDIS_INSTANCE_TLS_DISABLE|'true'||
|ENTITLEMENT_BASE_URL_PATH |/entitlements/v2||
|LOCKSMAP_REDIS_INSTANCE_ADDRESS|||
|LOCKSMAP_REDIS_INSTANCE_PORT|||
|LOCKSMAP_REDIS_INSTANCE_KEY|||
|LOCKSMAP_REDIS_INSTANCE_PORT |6379||
|LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE|'true'||
|LOG_LEVEL |ERROR||
|PORT |5000||
|REDIS_SDMS_HOST |redis-seismic-store||
|REDIS_SDMS_PORT |6379||
|SDMS_PREFIX |/api/seismic-store/v3||
|USER_ID_FROM_PROVIDER_API|"true"|It is for using Google API service for getting information from the token|
|TENANT_JOURNAL_ON_DATA_PARTITION|"true"|

## Secrets

|Variable|Example|Comments|
|-----|-----|------|
|DES_REDIS_INSTANCE_KEY|||

## Partition Service values 

GC implementation expects values in Partition service with the following names:

1. projectId - Google project id
1. dataPartitionId - Data partition ID
1. seismicBucket - a bucket for the Seismic
