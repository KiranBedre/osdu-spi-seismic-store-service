# Seismic Variables

| **Variable** | **Example** |
| --- | --- |
| **CLOUDPROVIDER** | anthos |
| **DES\_SERVICE\_HOST\_COMPLIANCE** | <http://legal/> |
| **DES\_SERVICE\_HOST\_ENTITLEMENT** | <http://entitlements/> |
| **DES\_SERVICE\_HOST\_PARTITION** | <http://partition/> |
| **DES\_SERVICE\_HOST\_STORAGE** | <http://storage/> |
| **LOCKSMAP\_REDIS\_INSTANCE\_ADDRESS** | { redis-host-without-https-schema } |
| **LOCKSMAP\_REDIS\_INSTANCE\_PORT** | 6379 |
| **LOG\_LEVEL** | DEBUG |
| **PORT** | 5000 |
| **SDMS\_BUCKET** | {seismic-store-bucket} |
| **SERVICE\_ENV** | dev |

Seismic Secrets

| **Variable** | **Example** |
| --- | --- |
| **KEYCLOAK\_CLIENT\_ID** | {keycloak client} |
| **KEYCLOAK\_CLIENT\_SECRET** | {keycloak secret} |
| **KEYCLOAK\_URL** | {keycloak-token-url} |
| **MINIO\_ACCESS\_KEY** | {minio-user-provisioned-for-seismic} |
| **MINIO\_ENDPOINT** | {minio-host} |
| **MINIO\_SECRET\_KEY** | {minio-secret-provisioned-for-seismic} |
| **AWS\_REGION** | Region for s3 bucket |
| **DATABASE\_URL** | postgresql://{user}:{passw} @{url}/{database} |

**NOTE** if `MINIO_ENDPOINT` it is empty, the anthos implementation will use aws sts to get authenticated to the s3 service (IAM/STS), this is for cloud sts based authentication (STS). If planned to use STS, it is mandatory to setup `AWS_REGION` env var (usually injected automatically if using IRSA or EKS Pod identity).
