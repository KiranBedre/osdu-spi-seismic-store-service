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

[[ -n "${WORKING_DIRECTORY:-}" ]] || fail "WORKING_DIRECTORY is required"
[[ -n "${RUNTIME_ARCHIVE:-}" ]] || fail "RUNTIME_ARCHIVE is required"

package_root="$(realpath "$WORKING_DIRECTORY")"
workspace="$(realpath .)"
[[ "$package_root" == "$workspace" || "$package_root" == "$workspace/"* ]] \
  || fail "working directory must stay inside the repository"

for path in package.json dist node_modules; do
  [[ -e "$package_root/$path" ]] || fail "runtime path '$WORKING_DIRECTORY/$path' is missing"
done

files=(package.json dist node_modules)
for lock_file in package-lock.json npm-shrinkwrap.json; do
  if [[ -f "$package_root/$lock_file" ]]; then
    files+=("$lock_file")
  fi
done
[[ "${#files[@]}" -gt 3 ]] || fail "runtime package has no npm lockfile"

npm --prefix "$package_root" ci --omit=dev

mkdir -p "$(dirname "$RUNTIME_ARCHIVE")"
tar -C "$package_root" -czf "$RUNTIME_ARCHIVE" "${files[@]}"
