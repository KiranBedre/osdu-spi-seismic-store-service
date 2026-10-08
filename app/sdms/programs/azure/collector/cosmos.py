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

import sys
import time
from datetime import datetime, timezone
from azure.cosmos import CosmosClient

class Subproject:
    def __init__(self, name: str, policy: str, storage_uri: str):
        self.name = name
        self.policy = policy
        self.storage_url = storage_uri

class Job:
    def __init__(self, name: str, first_execution: int, freq_execution: int, statistics: str):
        self.name = name
        self.first_execution = first_execution
        self.freq = freq_execution
        self.statistics = statistics

class Dataset:
    def __init__(self, name: str, path: str, storage_uri: str, created_by: str,
                 last_modified_date: str = ''):
        self.name = name
        self.path = path
        self.storage_uri = storage_uri
        self.created_by = created_by
        self.last_modified_date = last_modified_date

def get_subproject(subproject_name: str, cosmos_cs: str) -> Subproject:
    client = CosmosClient.from_connection_string(cosmos_cs)
    database = client.get_database_client('sdms-db')
    container_client = database.get_container_client('data')
    query = f'SELECT c.data.name, c.data.access_policy, c.data.gcs_bucket FROM c WHERE c.id = "sp-{subproject_name}"'
    query_result = container_client.query_items(
        query=query, enable_cross_partition_query=True)
    item = next(query_result)
    return Subproject(item['name'], item['access_policy'], item['gcs_bucket'])

def list_subproject(cosmos_cs: str):
    client = CosmosClient.from_connection_string(cosmos_cs)
    database = client.get_database_client('sdms-db')
    container_client = database.get_container_client('data')
    # query = f'SELECT c.data.name, c.data.access_policy, c.data.gcs_bucket FROM c WHERE c.id = "sp-{subproject_name}"'
    query = f'SELECT c.data.name, c.data.access_policy, c.data.gcs_bucket FROM c WHERE c.id LIKE "sp-%"'
    query_iterable = container_client.query_items(
        query=query,
        max_item_count=-1,
        enable_cross_partition_query=True
    )
    results: list[Subproject] = []
    count = 0
    start_time = time.time()
    for page in query_iterable.by_page():
        for item in page:
            count = count + 1
            results.append(
                Subproject(item['name'], item['access_policy'], item['gcs_bucket']))
        print(
            f'> {count} subprojects retrieved in {(time.time() - start_time)} seconds')
        sys.stdout.flush()
    return results

_JS_DATE_FORMATS = [
    "%a %b %d %Y %H:%M:%S GMT%z",
    "%a %b %d %Y %H:%M:%S GMT+0000",
]

def _parse_last_modified_date(date_str: str):
    #Parse a JS Date.toString() string into a UTC-aware datetime, or None on failure
    if not date_str:
        return None
    # Strip trailing parenthetical, e.g. " (Coordinated Universal Time)"
    clean = date_str.split(' (')[0].strip()
    for fmt in _JS_DATE_FORMATS:
        try:
            return datetime.strptime(clean, fmt).astimezone(timezone.utc)
        except ValueError:
            continue
    return None

def list_datasets(subproject_name: str, cosmos_cs: str, since: str = None) -> list:
    client = CosmosClient.from_connection_string(cosmos_cs)
    database = client.get_database_client('sdms-db')
    container_client = database.get_container_client('data')
    query = (f'SELECT c.data.path, c.data.name, c.data.gcsurl, c.data.created_by, '
             f'c.data.last_modified_date '
             f'FROM c WHERE c.data.subproject = "{subproject_name}"')
    query_iterable = container_client.query_items(
        query=query,
        max_item_count=-1,
        enable_cross_partition_query=True
    )

    since_dt = datetime.fromisoformat(since).astimezone(timezone.utc) if since else None
    mode = 'INCREMENTAL' if since_dt is not None else 'FULL'

    results: list[Dataset] = []
    count = 0            # datasets kept (new/modified)
    total = 0            # datasets seen in cosmos for this subproject
    skipped_old = 0      # datasets filtered out because unchanged since last run
    skipped_no_date = 0  # datasets with an unparsable/missing last_modified_date
    start_time = time.time()
    for page in query_iterable.by_page():
        for item in page:
            total += 1
            lmd = item.get('last_modified_date', '')
            if since_dt is not None:
                item_dt = _parse_last_modified_date(lmd)
                if item_dt is None:
                    # can't determine age -> keep it to be safe, but flag it for tracing
                    skipped_no_date += 1
                elif item_dt <= since_dt:
                    skipped_old += 1
                    continue
            count += 1
            results.append(
                Dataset(item['name'], item['path'], item['gcsurl'], item['created_by'], lmd))
        sys.stdout.flush()
    elapsed = time.time() - start_time
    if since_dt is not None:
        print(f'> [datasets] seen={total}, kept={count}, skipped={skipped_old}'
              + (f', missing_date={skipped_no_date}' if skipped_no_date else '')
              + f' in {elapsed:.2f}s')
    else:
        print(f'> [datasets] seen={total}, kept={count} in {elapsed:.2f}s')
    sys.stdout.flush()
    return results

def get_subproject_jobs(cosmos_cs: str) -> list([Job]):
    client = CosmosClient.from_connection_string(cosmos_cs)
    database = client.get_database_client('sdms-db')
    container_client = database.get_container_client('data')
    query = f'SELECT c.data.name, c.data.first_execution, c.data.freq_execution, c.data.statistics From c WHERE c.id LIKE "job-collection-%"'
    query_iterable = container_client.query_items(
        query=query,
        max_item_count=-1,
        enable_cross_partition_query=True
    )
    results: list[Job] = []
    count = 0
    for page in query_iterable.by_page():
        for item in page:
            count = count + 1
            results.append(
                Job(item['name'], item['first_execution'], item['freq_execution'], item['statistics']))
        print(
            f'> {count} jobs retrieved')
        sys.stdout.flush()
    return results

def get_partition_jobs(cosmos_cs: str) -> list([Job]):
    client = CosmosClient.from_connection_string(cosmos_cs)
    database = client.get_database_client('sdms-db')
    container_client = database.get_container_client('data')
    query = f'SELECT c.data.name, c.data.first_execution, c.data.freq_execution, c.data.statistics From c WHERE c.id = "dp-job-collection"'
    query_iterable = container_client.query_items(
        query=query,
        max_item_count=-1,
        enable_cross_partition_query=True
    )
    results = None
    count = 0
    for page in query_iterable.by_page():
        for item in page:
            count = count + 1
            results = (
                Job(item['name'], item['first_execution'], item['freq_execution'], item['statistics']))
        print(
            f'> {count} jobs retrieved')
        sys.stdout.flush()

    return results
