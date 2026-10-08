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

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="$HERE/../../actions/node-build"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

die() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

mkdir -p "$TMP/work/app" "$TMP/bin"
printf '{"scripts":{"lint":"x","build":"x","test-coverage":"x"}}\n' > "$TMP/work/app/package.json"
printf '{"lockfileVersion":3}\n' > "$TMP/work/app/package-lock.json"
cat > "$TMP/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$NPM_LOG"
if [[ "$*" == "run test-coverage" ]]; then
  mkdir -p coverage
  cat > test-results.xml <<'XML'
<testsuite tests="2" skipped="0" failures="0" errors="0"></testsuite>
XML
  echo "TN:" > coverage/lcov.info
fi
EOF
chmod +x "$TMP/bin/npm"

export WORKING_DIRECTORY=app
export NODE_VERSION=22
export LINT_SCRIPT=lint
export BUILD_SCRIPT=build
export TEST_SCRIPT=test-coverage
export TEST_REPORT=test-results.xml
export COVERAGE_FILE=coverage/lcov.info
export GITHUB_ACTION_PATH="$ACTION"
export GITHUB_OUTPUT="$TMP/output"
export NPM_LOG="$TMP/npm.log"

(cd "$TMP/work" && "$ACTION/validate-inputs.sh")
(cd "$TMP/work" && PATH="$TMP/bin:$PATH" "$ACTION/run-build.sh")

cat > "$TMP/expected.log" <<'EOF'
ci
run lint
run build
run test-coverage
EOF
cmp -s "$TMP/npm.log" "$TMP/expected.log" || die "npm commands or order changed"
grep -q '^build_result=success$' "$TMP/output" || die "success output missing"
ok "locked package builds with verified test and coverage evidence"

rm "$TMP/work/app/test-results.xml"
cat > "$TMP/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exit 0
EOF
chmod +x "$TMP/bin/npm"
RC=0
(cd "$TMP/work" && PATH="$TMP/bin:$PATH" "$ACTION/run-build.sh") >/dev/null 2>&1 || RC=$?
[[ "$RC" -ne 0 ]] || die "missing JUnit report must fail"
ok "missing test evidence fails"

WORKING_DIRECTORY=../escape RC=0
(cd "$TMP/work" && "$ACTION/validate-inputs.sh") >/dev/null 2>&1 || RC=$?
[[ "$RC" -eq 2 ]] || die "escaping working directory must exit 2"
ok "paths stay inside the repository"

WORKING_DIRECTORY=app
TEST_SCRIPT='test; whoami' RC=0
(cd "$TMP/work" && "$ACTION/validate-inputs.sh") >/dev/null 2>&1 || RC=$?
[[ "$RC" -eq 2 ]] || die "shell-shaped npm script must exit 2"
ok "npm script is one validated argv value"

echo "All Node build harness checks passed."
