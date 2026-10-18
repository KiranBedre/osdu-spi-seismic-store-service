#!/usr/bin/env python3
# Copyright © Microsoft Corporation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0

import json
import os
from pathlib import Path
import sys

from airflow.models import DagBag


def main() -> int:
    dag_path = Path(os.environ["DAG_PATH"])
    dag_id = os.environ["DAG_ID"]
    evidence_path = Path(os.environ["EVIDENCE_PATH"])

    if not dag_path.is_file():
        print(f"::error::Rendered DAG '{dag_path}' does not exist", file=sys.stderr)
        return 1

    dag_bag = DagBag(dag_folder=str(dag_path), include_examples=False, safe_mode=False)
    import_errors = {
        path: str(error) for path, error in sorted(dag_bag.import_errors.items())
    }
    dag_ids = sorted(dag_bag.dags)
    evidence = {
        "dagId": dag_id,
        "dagIds": dag_ids,
        "dagPath": dag_path.as_posix(),
        "importErrors": import_errors,
    }
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    if import_errors:
        print("::error::Airflow reported DAG import errors", file=sys.stderr)
        for path, error in import_errors.items():
            print(f"{path}: {error}", file=sys.stderr)
        return 1
    if dag_id not in dag_bag.dags:
        print(
            f"::error::Expected DAG '{dag_id}' was not found; parsed: {', '.join(dag_ids)}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
