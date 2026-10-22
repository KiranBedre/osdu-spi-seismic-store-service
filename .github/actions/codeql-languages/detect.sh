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

ROOT="${1:-.}"
cd "$ROOT"

LANGUAGES=()

append_language() {
  LANGUAGES+=("\"$1\"")
}

if [[ -f pom.xml || -f build.gradle || -f build.gradle.kts ]]; then
  append_language "java-kotlin"
fi

if [[ -f setup.py || -f pyproject.toml || -f requirements.txt ]] || \
   find . -name "*.py" \
     \( -not -path "./.*" -o -path "./.spi/*" \) \
     -not -path "*/build/*" \
     -not -path "*/build-*/*" \
     -not -path "*/target/*" \
     -not -path "*/dist/*" \
     -not -path "*/__pycache__/*" \
     -not -path "*/.venv/*" \
     -not -path "*/venv/*" \
     -not -path "*/.pytest_cache/*" \
     -not -path "*/.mypy_cache/*" \
     -not -path "*/node_modules/*" \
     -print -quit | grep -q .; then
  append_language "python"
fi

if [[ -f package.json ]] || \
   find . \( \
       -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \
       -o -name "*.ts" -o -name "*.mts" -o -name "*.cts" \
     \) \
     \( -not -path "./.*" -o -path "./.spi/*" \) \
     -not -path "*/build/*" \
     -not -path "*/build-*/*" \
     -not -path "*/target/*" \
     -not -path "*/dist/*" \
     -not -path "*/node_modules/*" \
     -print -quit | grep -q .; then
  append_language "javascript-typescript"
fi

if [[ -f go.mod ]] || \
   find . -name "*.go" \
     \( -not -path "./.*" -o -path "./.spi/*" \) \
     -print -quit | grep -q .; then
  append_language "go"
fi

if [[ ${#LANGUAGES[@]} -eq 0 ]]; then
  append_language "java-kotlin"
fi

append_language "actions"

IFS=,
printf '[%s]\n' "${LANGUAGES[*]}"
