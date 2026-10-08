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

fail() {
  echo "::error::$1"
  exit 2
}

relative_path() {
  local name="$1" value="$2"
  [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$ ]] \
    || fail "$name must be a repository-relative path"
  [[ "/$value/" != *"/../"* ]] || fail "$name must stay inside the repository"
}

script_name() {
  local name="$1" value="$2"
  [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$ ]] \
    || fail "$name must be one npm script name"
}

relative_path working_directory "$WORKING_DIRECTORY"
relative_path test_report "$TEST_REPORT"
relative_path coverage_file "$COVERAGE_FILE"
[[ "$NODE_VERSION" =~ ^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$ ]] \
  || fail "node_version must be a numeric Node.js version"
script_name lint_script "$LINT_SCRIPT"
script_name build_script "$BUILD_SCRIPT"
script_name test_script "$TEST_SCRIPT"

[[ -d "$WORKING_DIRECTORY" ]] || fail "working directory '$WORKING_DIRECTORY' does not exist"
[[ -f "$WORKING_DIRECTORY/package.json" ]] \
  || fail "working directory '$WORKING_DIRECTORY' has no package.json"

LOCK_FILE=""
for candidate in package-lock.json npm-shrinkwrap.json; do
  if [[ -f "$WORKING_DIRECTORY/$candidate" ]]; then
    LOCK_FILE="$WORKING_DIRECTORY/$candidate"
    break
  fi
done
[[ -n "$LOCK_FILE" ]] || fail "working directory '$WORKING_DIRECTORY' has no npm lockfile"

{
  echo "lock_file=$LOCK_FILE"
  echo "test_report=$WORKING_DIRECTORY/$TEST_REPORT"
  echo "coverage_file=$WORKING_DIRECTORY/$COVERAGE_FILE"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
