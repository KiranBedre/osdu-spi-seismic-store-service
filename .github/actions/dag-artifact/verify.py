#!/usr/bin/env python3
"""Validate the independently published Airflow DAG artifact contract."""

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

REQUIRED_FILES = ("dag.zip", "dag.zip.sha256", "workflow.json")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksum(root: Path) -> str:
    lines = [
        line
        for line in (root / "dag.zip.sha256").read_text(encoding="utf-8").splitlines()
        if line
    ]
    if len(lines) != 1:
        raise ValueError("dag.zip.sha256 must contain exactly one entry")
    parts = lines[0].split()
    if len(parts) != 2 or parts[1].lstrip("*") != "dag.zip":
        raise ValueError("dag.zip.sha256 must name dag.zip")
    expected = parts[0].lower()
    if not SHA256_RE.fullmatch(expected):
        raise ValueError("dag.zip.sha256 does not contain a SHA-256 digest")
    if sha256(root / "dag.zip") != expected:
        raise ValueError("dag.zip checksum does not match")
    return expected


def verify_zip(root: Path) -> list[str]:
    with zipfile.ZipFile(root / "dag.zip") as archive:
        members = archive.namelist()
        paths = [Path(member) for member in members]
        if not paths or not any(path.suffix == ".py" for path in paths):
            raise ValueError("dag.zip must contain at least one Python file")
        if any(path.is_absolute() or ".." in path.parts for path in paths):
            raise ValueError("dag.zip contains an unsafe path")
        corrupt_member = archive.testzip()
        if corrupt_member:
            raise ValueError(f"dag.zip contains a corrupt member: {corrupt_member}")
    return members


def verify_workflow(root: Path) -> dict:
    registration = json.loads((root / "workflow.json").read_text(encoding="utf-8"))
    if isinstance(registration, list):
        if len(registration) != 1:
            raise ValueError("workflow.json must contain exactly one registration")
        registration = registration[0]
    if not isinstance(registration, dict):
        raise TypeError("workflow.json must be a JSON object")
    instructions = registration.get("registrationInstructions")
    required_strings = [
        registration.get("workflowName"),
        registration.get("description"),
        instructions.get("dagName") if isinstance(instructions, dict) else None,
    ]
    if not all(isinstance(value, str) and value for value in required_strings):
        raise ValueError("workflow.json is missing required string fields")
    return registration


def verify(root: Path) -> dict:
    if not root.is_dir():
        raise ValueError(f"artifact directory does not exist: {root}")
    missing = [name for name in REQUIRED_FILES if not (root / name).is_file()]
    if missing:
        raise ValueError(f"artifact is missing required files: {', '.join(missing)}")
    checksum = verify_checksum(root)
    members = verify_zip(root)
    registration = verify_workflow(root)
    return {
        "checksum": checksum,
        "dagMembers": sorted(members),
        "workflowName": registration["workflowName"],
        "dagName": registration["registrationInstructions"]["dagName"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact_path", type=Path)
    args = parser.parse_args()
    try:
        evidence = verify(args.artifact_path)
    except (OSError, TypeError, ValueError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
