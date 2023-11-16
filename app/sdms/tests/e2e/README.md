# SEISMIC DMS E2E TESTS

Postman collection with API requests that check the basic functionality of the service and verify that Seismic DMS service could work with other services

## Variable description

| Variable name | Description | Requirement |
| ---- | ---- | ---- |
| SVC_URL | seismic store service url | Required |
| STOKEN | user or service agent idtoken | Required |
| tenant| seistore working tenant | Required |
| datapartition | seistore working data partition | Required |
| subproject | seistore working subproject | Optional |
| legaltag01 | valid legal tag registered in Legal Service | Required |
| legaltag02 | another valid legal tag registered in Legal Service | Required |
| newuser | valid user registered in data partition other then STOKEN issued for | Required if _VCS_Provider_ is not set |
| newusergroup | valid user group registered in data partition | Required if _VCS_Provider_ is not set |
| VCS_Provider | possible values are `true` for script or `gitlab` for Newman. It is needed to skip USER and IMPTOKEN API endpoints test | Required if `newuser` and/or `newusergroup` is not set |
| SVC_API_KEY | historical variables and could be any string | Optional |
| DE_APP_KEY | historical variables and could be any string | Optional |
---

## How to run the tests

### Script usage

To run tests using bash script:

1. Open _[Git_Bash](https://git-scm.com/downloads)_ terminal
1. Clone the repository

    ```bash
    git clone https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service.git
    ```

1. Move into the folder with script

    ```bash
    cd app/sdms/tests/e2e/run_e2e_tests.sh
    ```

1. Make it executable (for Unix/Linux)

    ```bash
    chmod +x ./tests/e2e/run_e2e_tests.sh
    ```

1. Run the script

    ```bash
    ./tests/e2e/run_e2e_tests.sh \
        --seistore-svc-url="https://${DNS_HOST}/${serviceUrlSuffix}" \
        --seistore-svc-api-key="NA" \
        --user-idtoken="${e2eIdToken}" \
        --tenant="${e2eTenant}" \
        --subproject="${e2eSubproject}" \
        --admin-email="${e2eAdminEmail}" \
        --datapartition="${e2eDataPartition}" \
        --legaltag01="${e2eLegaltag01}" \
        --legaltag02="${e2eLegaltag02}" \
        --VCS_Provider="${isGitlab}"
    ```

### Postman Runner usage

To run tests using [Postman](https://www.postman.com/downloads/) Runner tool:

1. Open _[Git_Bash](https://git-scm.com/downloads)_ terminal
1. Clone the repository

    ```bash
    git clone https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service.git
    ```

1. Open Postman
1. Import _app/sdms/tests/e2e/postman_collection.json_
1. Import _app/sdms/tests/e2e/postman_env.json_
1. Replace variables with proper values in Postman Environment
1. Select Postman collection and click _Run_ button
1. Verify it will use right postman environment and click _Run SDMS-E2E-xxx_ button
