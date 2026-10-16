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

import os
import re
import sys
from pathlib import Path

PLACEHOLDER = re.compile(r"^\$\{([A-Za-z_][A-Za-z0-9_]{0,127})\}$")


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(2)


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return path != parent


suite_root = Path(os.environ.get("SUITE_ROOT", "/suite")).resolve()
suite_dir = os.environ.get("SUITE_DIR")
if not suite_dir:
    suite_dir = (suite_root / ".default-suite-dir").read_text(encoding="utf-8")
entrypoint = os.environ.get("SUITE_ENTRYPOINT")
if not entrypoint:
    fail("SUITE_ENTRYPOINT is required for a script suite")

requested_working_directory = (suite_root / suite_dir).absolute()
requested_executable = (requested_working_directory / entrypoint).absolute()
if (
    requested_working_directory != suite_root
    and not is_within(requested_working_directory, suite_root)
) or not is_within(requested_executable, requested_working_directory):
    fail("suite directory and entrypoint must stay inside /suite")
if not requested_executable.exists():
    fail(f"script suite entrypoint '{entrypoint}' is not baked into '{suite_dir}'")

working_directory = requested_working_directory.resolve()
executable = requested_executable.resolve()
if (
    working_directory != suite_root and not is_within(working_directory, suite_root)
) or not is_within(executable, working_directory):
    fail("suite directory and entrypoint symlinks must stay inside /suite")

arguments = []
for argument in sys.argv[1:]:
    match = PLACEHOLDER.fullmatch(argument)
    if match:
        name = match.group(1)
        value = os.environ.get(name)
        if not value:
            fail(f"script argument references unresolved environment variable '{name}'")
        arguments.append(value)
    elif "${" in argument:
        fail("an environment placeholder must be the entire script argument")
    else:
        arguments.append(argument)

os.chdir(working_directory)
try:
    os.execve(executable, [str(executable), *arguments], os.environ)
except OSError as error:
    print(f"failed to start script suite: {error}", file=sys.stderr)
    raise SystemExit(1) from error
