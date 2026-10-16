#!/usr/bin/env bash
# Copyright © Microsoft Corporation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0

set -euo pipefail

mkdir -p "$(dirname "$SPI_TEST_REPORT")" "$(dirname "$SPI_COVERAGE_FILE")"
bash "$BUILD_SCRIPT"

for path in "$SPI_TEST_REPORT" "$SPI_COVERAGE_FILE"; do
  if [[ ! -s "$path" ]]; then
    echo "::error::Python build completed without required evidence '$path'"
    exit 1
  fi
done

echo "build_result=success" >> "$GITHUB_OUTPUT"
