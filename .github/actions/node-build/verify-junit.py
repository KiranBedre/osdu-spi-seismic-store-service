#!/usr/bin/env python3
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

import pathlib
import sys
import xml.etree.ElementTree as ET


def main() -> int:
    report = pathlib.Path(sys.argv[1])
    if not report.is_file():
        print(f"error: JUnit report '{report}' is missing", file=sys.stderr)
        return 1
    try:
        root = ET.parse(report).getroot()
    except ET.ParseError as error:
        print(f"error: JUnit report '{report}' is unreadable: {error}", file=sys.stderr)
        return 1

    suites = [root] if root.tag == "testsuite" else list(root.findall(".//testsuite"))
    tests = sum(int(suite.get("tests", 0)) for suite in suites)
    skipped = sum(int(suite.get("skipped", 0)) for suite in suites)
    failures = sum(int(suite.get("failures", 0)) for suite in suites)
    errors = sum(int(suite.get("errors", 0)) for suite in suites)
    if tests - skipped <= 0:
        print(f"error: no tests executed ({skipped} skipped)", file=sys.stderr)
        return 1
    if failures or errors:
        print(f"error: {failures + errors} tests failed or errored", file=sys.stderr)
        return 1
    print(f"verified {tests - skipped} tests ({skipped} skipped)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
