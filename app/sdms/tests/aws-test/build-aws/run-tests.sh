# Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http:#www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# This script executes the test and copies reports to the provided output directory
# To call this script from the service working directory
# ./dist/testing/integration/build-aws/run-tests.sh "./reports/"
echo '****Running SeismicStore Service integration tests*****************'

SCRIPT_SOURCE_DIR=$(dirname "$0")
SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

pushd "$SCRIPT_SOURCE_DIR"/../

rm -rf test-reports/
mkdir test-reports

echo "Creating tmp/sdmsawstest dir"
mkdir -p /tmp/sdmsawstest
pushd /tmp/sdmsawstest
npm install newman@v5.3.2
echo "check if node_modules exists"
[ -d "/tmp/sdmsawstest/node_modules" ] && echo "Directory /tmp/sdmsawstest/node_modules exists." || echo "Error: Directory /tmp/sdmsawstest/node_modules does not exists."
echo "Copying node_modules now.."
cp -R /tmp/sdmsawstest/node_modules $SCRIPTPATH/../../

popd
cd ..
echo $(pwd)

export AWS_COGNITO_AUTH_PARAMS_USER=${ADMIN_USER} #set by env script
export AWS_COGNITO_AUTH_PARAMS_PASSWORD=${ADMIN_PASSWORD} #set by codebuild 

pip3 install -r aws-test/build-aws/requirements.txt
token=$(python3 aws-test/build-aws/aws_jwt_client.py)
echo '****Generating token*****************'
# echo $token
# printenv
echo 'Register Legal tag before Integration Tests ...'
curl --location --request POST "$LEGAL_URL"'legaltags' \
  --header 'accept: application/json' \
  --header 'authorization: Bearer '"$token" \
  --header 'content-type: application/json' \
  --header 'data-partition-id: opendes' \
  --data '{
        "name": "sdmstestlegaltag",
        "description": "test legal for Seismic DMS Service",
        "properties": {
            "countryOfOrigin":["US"],
            "contractId":"A1234",
            "expirationDate":"2099-01-25",
            "dataType":"Public Domain Data", 
            "originator":"MyCompany",
            "securityClassification":"Public",
            "exportClassification":"EAR99",
            "personalData":"No Personal Data"
        }
}'
echo 'Register SeismicStore.tenants before Integration Tests ...'
curl --location --request POST "$SEISMIC_DMS_URL"'/tenant/opendes' \
  --header 'accept: application/json' \
  --header 'authorization: Bearer '"$token" \
  --header 'content-type: application/json' \
  --header 'data-partition-id: opendes' \
  --data '{
        "default_acls": "users.datalake.admins@opendes.example.com",
        "esd": "opendes.example.com",
        "gcpid": "opendes"
}'

chmod +x ./tests/e2e/run_e2e_tests.sh
echo Running Seismic-Store Service Integration Tests...

tenant='opendes'
legaltag='opendes-sdmstestlegaltag'
subproject='subproject'
RANDOM=$$
subproject+=$RANDOM
newuser='newuser'
newuser+=$RANDOM
newuser+='@testing.com'
newusergroup='users.seismic-int-test-'
newusergroup+=$RANDOM
newusergroup+='.any'
echo $subproject
echo $newuser

echo Creating newusergroup: $newusergroup
curl --location --request POST "$ENTITLEMENTS_URL"'groups' \
--header 'data-partition-id: opendes' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer '"$token" \
--data-raw '{
    "name": "'$newusergroup'",
    "description": "Meant for seismic testing"
}
'

./tests/e2e/run_e2e_tests.sh --seistore-svc-url=$SEISMIC_DMS_URL --seistore-svc-api-key='xx' --user-idtoken=$token --tenant=$tenant --subproject=$subproject --admin-email=$ADMIN_USER --datapartition=$tenant --legaltag01=$legaltag --legaltag02=$legaltag --newuser=$newuser --newusergroup=$newusergroup
TEST_EXIT_CODE=$?
mv newman newman_test_reports
popd

echo Deleting newusergroup: $newusergroup
curl --location --request DELETE "$ENTITLEMENTS_URL"'groups/'"$newusergroup"'@opendes.example.com' \
--header 'data-partition-id: opendes' \
--header 'Authorization: Bearer '"$token"

echo Delete legaltag after Integration Tests...
curl --location --request DELETE "$LEGAL_URL"'legaltags/opendes-sdmstestlegaltag' \
--header 'Authorization: Bearer '"$token" \
--header 'data-partition-id: opendes' \
--header 'Content-Type: application/json'


exit $TEST_EXIT_CODE
