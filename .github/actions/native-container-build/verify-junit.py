#!/usr/bin/env python3

import pathlib
import sys
import xml.etree.ElementTree as ET


def main() -> int:
    report = pathlib.Path(sys.argv[1])
    if not report.is_file():
        print(f"error: CTest JUnit report '{report}' is missing", file=sys.stderr)
        return 1
    try:
        root = ET.parse(report).getroot()
    except ET.ParseError as error:
        print(f"error: CTest JUnit report '{report}' is unreadable: {error}", file=sys.stderr)
        return 1

    suites = [root] if root.tag == "testsuite" else list(root.findall(".//testsuite"))
    try:
        tests = sum(int(suite.get("tests", 0)) for suite in suites)
        skipped = sum(int(suite.get("skipped", 0)) for suite in suites)
        failures = sum(int(suite.get("failures", 0)) for suite in suites)
        errors = sum(int(suite.get("errors", 0)) for suite in suites)
    except ValueError as error:
        print(
            f"error: CTest JUnit report '{report}' has an invalid count: {error}",
            file=sys.stderr,
        )
        return 1
    if tests - skipped <= 0:
        print(f"error: no native tests executed ({skipped} skipped)", file=sys.stderr)
        return 1
    if failures or errors:
        print(f"error: {failures + errors} native tests failed or errored", file=sys.stderr)
        return 1
    print(f"verified {tests - skipped} native tests ({skipped} skipped)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
