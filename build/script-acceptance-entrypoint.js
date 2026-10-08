#!/usr/bin/env node
// Copyright © Microsoft Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const suiteRoot = fs.realpathSync(process.env.SUITE_ROOT || "/suite");
const suiteDir = process.env.SUITE_DIR || fs.readFileSync(
  path.join(suiteRoot, ".default-suite-dir"),
  "utf8",
);
const entrypoint = process.env.SUITE_ENTRYPOINT;

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!entrypoint) {
  fail("SUITE_ENTRYPOINT is required for a script suite");
}

const requestedWorkingDirectory = path.resolve(suiteRoot, suiteDir);
const requestedExecutable = path.resolve(requestedWorkingDirectory, entrypoint);
if (!requestedWorkingDirectory.startsWith(`${suiteRoot}${path.sep}`) ||
    !requestedExecutable.startsWith(`${requestedWorkingDirectory}${path.sep}`)) {
  fail("suite directory and entrypoint must stay inside /suite");
}
if (!fs.existsSync(requestedExecutable)) {
  fail(`script suite entrypoint '${entrypoint}' is not baked into '${suiteDir}'`);
}
const workingDirectory = fs.realpathSync(requestedWorkingDirectory);
const executable = fs.realpathSync(requestedExecutable);
if (!workingDirectory.startsWith(`${suiteRoot}${path.sep}`) ||
    !executable.startsWith(`${workingDirectory}${path.sep}`)) {
  fail("suite directory and entrypoint symlinks must stay inside /suite");
}

const placeholder = /^\$\{([A-Za-z_][A-Za-z0-9_]{0,127})\}$/;
const args = process.argv.slice(2).map((argument) => {
  const match = argument.match(placeholder);
  if (match) {
    const name = match[1];
    const value = process.env[name];
    if (value === undefined || value === "") {
      fail(`script argument references unresolved environment variable '${name}'`);
    }
    return value;
  }
  if (argument.includes("${")) {
    fail("an environment placeholder must be the entire script argument");
  }
  return argument;
});

const result = spawnSync(executable, args, {
  cwd: workingDirectory,
  env: process.env,
  stdio: "inherit",
});
if (result.error) {
  console.error(`failed to start script suite: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`script suite terminated by ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
