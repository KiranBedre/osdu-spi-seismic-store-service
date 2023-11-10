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

# This script prepares the dist directory for the integration tests.
# Must be run from the root of the repository

set -e

OUTPUT_DIR="${OUTPUT_DIR:-dist}"

INTEGRATION_TEST_OUTPUT_DIR=${INTEGRATION_TEST_OUTPUT_DIR:-$OUTPUT_DIR}/testing/integration
INTEGRATION_TEST_OUTPUT_BIN_DIR=${INTEGRATION_TEST_OUTPUT_DIR:-$INTEGRATION_TEST_OUTPUT_DIR}/bin
INTEGRATION_TEST_SOURCE_DIR=tests
INTEGRATION_TEST_SOURCE_DIR_AWS="$INTEGRATION_TEST_SOURCE_DIR"/aws-test
INTEGRATION_TEST_SOURCE_DIR_CORE="$INTEGRATION_TEST_SOURCE_DIR"/e2e

echo "--Source directories variables--"
echo $INTEGRATION_TEST_SOURCE_DIR_AWS
echo $INTEGRATION_TEST_SOURCE_DIR_CORE
echo "--Output directories variables--"
echo $OUTPUT_DIR
echo $INTEGRATION_TEST_OUTPUT_DIR
echo $INTEGRATION_TEST_OUTPUT_BIN_DIR

rm -rf "$INTEGRATION_TEST_OUTPUT_DIR"
mkdir -p "$INTEGRATION_TEST_OUTPUT_DIR" && mkdir -p "$INTEGRATION_TEST_OUTPUT_BIN_DIR"
mkdir -p "$INTEGRATION_TEST_OUTPUT_BIN_DIR"/tests
cp -r "$INTEGRATION_TEST_SOURCE_DIR_AWS" "${INTEGRATION_TEST_OUTPUT_BIN_DIR}"
cp  -r "$INTEGRATION_TEST_SOURCE_DIR_CORE" "${INTEGRATION_TEST_OUTPUT_BIN_DIR}/tests"




