#!/usr/bin/env python

# Copyright 2017-2024, Schlumberger
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

import shutil

def bytes_to_human_readable(size_in_bytes):
    if size_in_bytes == 0:
        return "0B"
    suffixes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    index = 0
    while size_in_bytes >= 1024 and index < len(suffixes) - 1:
        size_in_bytes /= 1024
        index += 1
    return "{:.2f} {}".format(size_in_bytes, suffixes[index])

def sort_csv_file(file_name):
    with open(file_name, 'r') as file:
        lines = file.readlines()
    header = lines[0]
    data_lines = lines[1:]
    sorted_lines = sorted(data_lines, key=lambda x: x.split(',')[0])
    with open(file_name, 'w') as file:
        file.write(header)
        for line in sorted_lines:
            file.write(line)

def format_execution_time(execution_time):
    hours, remainder = divmod(execution_time, 3600)
    minutes, remainder = divmod(remainder, 60)
    seconds, milliseconds = divmod(remainder, 1)
    result = ""
    if hours > 0:
        result += f"{int(hours)}h "
    if minutes > 0 or hours > 0:
        result += f"{int(minutes)}m "
    if seconds > 0 or minutes > 0 or hours > 0:
        result += f"{int(seconds)}s "
    result += f"{int(milliseconds * 1000)}ms"
    return result

def has_more_than_one_line(file_path):
    with open(file_path, 'r') as file:
        file.readline()
        second_line = file.readline()
        return bool(second_line)

def clean_up_local(folder):
    try:
        shutil.rmtree(folder)
    except Exception as e:
        print(e)

def get_incremental_watermark(state: dict, subproject_name: str):
    """
    Per-subproject incremental cutoff stored in last_run_state.json.
    External consumers expect each value to be an ISO-8601 string (unchanged contract).
    """
    raw = state.get(subproject_name)
    if raw is None:
        return None
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        # tolerate interim structured writes; never persist this shape again
        return raw.get('watermark')
    return None

def set_incremental_watermark(state: dict, subproject_name: str, watermark_iso: str) -> None:
    state[subproject_name] = watermark_iso

def normalize_last_run_state(state: dict) -> dict:
    """Coerce state to the published schema: { subproject: iso8601-string }."""
    normalized = {}
    for key, value in state.items():
        if isinstance(value, str):
            normalized[key] = value
        elif isinstance(value, dict):
            watermark = value.get('watermark')
            if isinstance(watermark, str):
                normalized[key] = watermark
    return normalized
