#!/usr/bin/env bash
# Copyright © Microsoft Corporation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0

set -euo pipefail

safe_path() {
  [[ "$1" =~ ^[A-Za-z0-9._/-]{1,200}$ ]] &&
    [[ "$1" != /* ]] &&
    [[ "/$1/" != *"/../"* ]]
}

for name in WORKING_DIRECTORY REQUIREMENTS_FILE TEST_REQUIREMENTS_FILE BUILD_SCRIPT TEST_REPORT COVERAGE_FILE; do
  value="${!name}"
  if ! safe_path "$value"; then
    echo "::error::$name must be a repository-relative path without traversal, got '$value'"
    exit 2
  fi
done

if [[ ! "$PYTHON_VERSION" =~ ^[0-9]{1,2}\.[0-9]{1,2}(\.[0-9]{1,2})?$ ]]; then
  echo "::error::PYTHON_VERSION must be a major.minor or major.minor.patch version"
  exit 2
fi
if [[ -n "$AIRFLOW_VERSION" ]]; then
  if [[ ! "$AIRFLOW_VERSION" =~ ^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}$ ]]; then
    echo "::error::AIRFLOW_VERSION must be an exact major.minor.patch version"
    exit 2
  fi
  if ! safe_path "$DAG_PATH" || [[ "$DAG_PATH" == "." ]]; then
    echo "::error::DAG_PATH must be a repository-relative file path without traversal"
    exit 2
  fi
  if [[ ! "$DAG_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,249}$ ]]; then
    echo "::error::DAG_ID must contain only letters, digits, dots, underscores, and hyphens"
    exit 2
  fi
elif [[ -n "$DAG_PATH" || -n "$DAG_ID" ]]; then
  echo "::error::DAG_PATH and DAG_ID require AIRFLOW_VERSION"
  exit 2
fi
if [[ ! -d "$WORKING_DIRECTORY" ]]; then
  echo "::error::Python working directory '$WORKING_DIRECTORY' does not exist"
  exit 2
fi

prefix=""
if [[ "$WORKING_DIRECTORY" != "." ]]; then
  prefix="$WORKING_DIRECTORY/"
fi
requirements_path="${prefix}${REQUIREMENTS_FILE}"
test_requirements_path="${prefix}${TEST_REQUIREMENTS_FILE}"
for path in "$requirements_path" "$test_requirements_path" "$BUILD_SCRIPT"; do
  if [[ ! -f "$path" ]]; then
    echo "::error::Required Python build input '$path' does not exist"
    exit 2
  fi
done

{
  echo "requirements_file=$requirements_path"
  echo "test_requirements_file=$test_requirements_path"
  echo "build_script=$BUILD_SCRIPT"
  echo "test_report=$TEST_REPORT"
  echo "coverage_file=$COVERAGE_FILE"
} >> "$GITHUB_OUTPUT"
