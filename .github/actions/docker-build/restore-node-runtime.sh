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

[[ -n "${BUILD_CONTEXT:-}" ]] || fail "BUILD_CONTEXT is required"
[[ -n "${RUNTIME_ARCHIVE:-}" ]] || fail "RUNTIME_ARCHIVE is required"
[[ -f "$RUNTIME_ARCHIVE" ]] || fail "Node runtime artifact is missing"

workspace="$(realpath .)"
context="$(realpath "$BUILD_CONTEXT")"
[[ -d "$context" && ("$context" == "$workspace" || "$context" == "$workspace/"*) ]] \
  || fail "build context must stay inside the repository"

while IFS= read -r entry; do
  [[ "$entry" != /* && "/$entry/" != *"/../"* ]] \
    || fail "Node runtime artifact contains an unsafe path"
done < <(tar -tzf "$RUNTIME_ARCHIVE")

tar -C "$context" -xzf "$RUNTIME_ARCHIVE"
for path in package.json dist node_modules; do
  [[ -e "$context/$path" ]] || fail "Node runtime artifact did not restore '$path'"
done
[[ -f "$context/package-lock.json" || -f "$context/npm-shrinkwrap.json" ]] \
  || fail "Node runtime artifact did not restore an npm lockfile"
