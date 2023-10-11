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
echo '****Running SeismicStore Service V4 integration tests*****************'

SCRIPT_SOURCE_DIR=$(dirname "$0")
SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

pushd "$SCRIPT_SOURCE_DIR"/../
rm -rf test-reports/
mkdir test-reports
cd ..

export AWS_COGNITO_AUTH_PARAMS_USER=${ADMIN_USER} #set by env script
export AWS_COGNITO_AUTH_PARAMS_PASSWORD=${ADMIN_PASSWORD} #set by codebuild 

pip3 install -r aws-test/build-aws/requirements.txt
token=$(python3 aws-test/build-aws/aws_jwt_client.py)
echo '****Generating token*****************'
# echo $token
# printenv

chmod +x ./tests/e2e/run.sh
echo Running Seismic-Store Service V4 Integration Tests...

npm install

./tests/e2e/run.sh --osdu-url=$AWS_BASE_URL --access-token=$token --partition='osdu' --acl-owners='data.default.owners@osdu.example.com' --acl-viewers='data.default.viewers@osdu.example.com'
TEST_EXIT_CODE=$?
popd

exit $TEST_EXIT_CODE