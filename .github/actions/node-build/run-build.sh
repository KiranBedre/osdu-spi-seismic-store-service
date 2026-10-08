#!/usr/bin/env bash
# Copyright © Microsoft Corporation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

cd "$WORKING_DIRECTORY"
npm install --global npm@11.19.0
npm ci
npm run "$LINT_SCRIPT"
npm run "$BUILD_SCRIPT"
npm run "$TEST_SCRIPT"

python3 "$GITHUB_ACTION_PATH/verify-junit.py" "$TEST_REPORT"
if [[ ! -s "$COVERAGE_FILE" ]]; then
  echo "::error::coverage file '$WORKING_DIRECTORY/$COVERAGE_FILE' is missing or empty"
  exit 1
fi

echo "build_result=success" >> "${GITHUB_OUTPUT:-/dev/stdout}"
