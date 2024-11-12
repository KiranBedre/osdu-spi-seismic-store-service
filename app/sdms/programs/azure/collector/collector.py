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

import time
import os
import sys
import threading
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

import partition
import utils
import cosmos

from azure.storage.blob import BlobServiceClient, StandardBlobTier

STORAGE_CONTAINER_RESULTS:str = 'sdms-analytics-reports'
OVERWRITE:bool = True
CLEANUP:bool = True

class FileWriter:
    def __init__(self, filename):
        self.lock = threading.Lock()
        self.file = open(filename, 'w')

    def write(self, data):
        with self.lock:
            self.file.write(data + '\n')

    def close(self):
        self.file.close()

class Statistics:
    def __init__(self, stats_args: list([str])):
        self.objects: bool = 'OB' in stats_args
        self.size: bool = 'SZ' in stats_args
        self.hot: bool = 'TH' in stats_args
        self.cool: bool = 'TC' in stats_args
        self.cold: bool = 'TD' in stats_args
        self.archive: bool = 'TA' in stats_args
        self.unknown: bool = 'TU' in stats_args
        self.touched: bool = 'HN' in stats_args
        self.touched_size: bool = 'HS' in stats_args
        self.created_by: bool = 'CB' in stats_args
        self.creation_time: bool = 'CT' in stats_args
        self.last_accessed_on: bool = 'LA' in stats_args
        self.last_modified: bool = 'LM' in stats_args
        self.last_modified_tier: bool = 'LT' in stats_args

def collect_dataset_statistics(dataset: cosmos.Dataset, container_name: str, prefix: str):
    blob_service_client = BlobServiceClient.from_connection_string(storage_cs)
    container_client = blob_service_client.get_container_client(container_name)
    objects = 0
    size = 0
    size_hot = 0
    size_cool = 0
    size_cold = 0
    size_archive = 0
    size_unknown = 0
    creation_time = '-'
    last_accessed_on = '-'
    last_modified = '-'
    last_modified_tier = '-'
    count_touched = 0
    size_touched = 0

    # iterate over all objects composing the dataset
    for blob in container_client.list_blobs(name_starts_with=prefix):

        objects = objects + 1
        size = size + blob.size

        # check tiers, if not recognized (new tier?) consider it as unknown
        if blob.blob_tier == StandardBlobTier.HOT:
            size_hot = size_hot + blob.size
        elif blob.blob_tier == StandardBlobTier.COOL:
            size_cool = size_cool + blob.size
        elif blob.blob_tier == StandardBlobTier.COLD:
            size_cold = size_cold + blob.size
        elif blob.blob_tier == StandardBlobTier.ARCHIVE:
            size_archive = size_archive + blob.size
        else:
            size_unknown = size_unknown + blob.size

        # the dataset creation time is the smaller creation time considering all objects
        if blob.creation_time is not None:
            if creation_time == '-':
                creation_time = blob.creation_time.timestamp()
            else:
                creation_time = min(
                    creation_time, blob.creation_time.timestamp())

        # the dataset last accessed on is the latest accessed time considering all objects
        if blob.last_accessed_on is not None:
            if last_accessed_on == '-':
                last_accessed_on = blob.last_accessed_on.timestamp()
            else:
                last_accessed_on = max(
                    last_accessed_on, blob.last_accessed_on.timestamp())

        # the dataset last modified time is the latest modified time considering all objects
        if blob.last_modified is not None:
            if last_modified == '-':
                last_modified = blob.last_modified.timestamp()
            else:
                last_modified = max(
                    last_modified, blob.last_modified.timestamp())

        # the dataset last modified tier is the latest modified tier time considering all objects
        if blob.blob_tier_change_time is not None:
            if last_modified_tier == '-':
                last_modified_tier = blob.blob_tier_change_time.timestamp()
            else:
                last_modified_tier = max(
                    last_modified_tier, blob.blob_tier_change_time.timestamp())

        # check if object was touched (accessed of modified after its creation)
        if blob.creation_time is not None:
            ct = blob.creation_time.timestamp()
            if (blob.last_accessed_on is not None and blob.last_accessed_on.timestamp() > ct) or (blob.last_modified is not None and blob.last_modified.timestamp() > ct) or (blob.blob_tier_change_time is not None and blob.blob_tier_change_time.timestamp() > ct):
                count_touched = count_touched + 1
                size_touched = size_touched + blob.size

    # output the dataset collected info
    dataset_name = os.path.join(dataset.path, dataset.name)
    if statistics.size:
        print(f'> {dataset_name} - {utils.bytes_to_human_readable(size)}')
    else:
        print(f'> {dataset_name}')
    
    line = dataset_name
    if statistics.objects:
        line += f',{objects}'
    if statistics.size:
        line += f',{size}'
    if statistics.hot:
        line += f',{size_hot}'
    if statistics.cool:
        line += f',{size_cool}'      
    if statistics.cold:
        line += f',{size_cold}'
    if statistics.archive:
        line += f',{size_archive}'
    if statistics.unknown:
        line += f',{size_unknown}'
    if statistics.touched:
        line += f',{count_touched}' 
    if statistics.touched_size:
        line += f',{size_touched}'
    if statistics.created_by:
        line += f',{dataset.created_by}'
    if statistics.creation_time:
        line += f',{creation_time}'
    if statistics.last_accessed_on:
        line += f',{last_accessed_on}'
    if statistics.last_modified:
        line += f',{last_modified}'
    if statistics.last_modified_tier:
        line += f',{last_modified_tier}'
    file_out.write(f'{line}')

def collect_statistics(subproject: cosmos.Subproject, datasets: list([cosmos.Dataset])) -> None:
    with ThreadPoolExecutor(max_workers=max_threads) as executor:
        for dataset in datasets:
            container_name = subproject.storage_url if subproject.policy == 'uniform' else dataset.storage_uri
            prefix = dataset.storage_uri.replace(
                f'{subproject.storage_url}/', '') if subproject.policy == 'uniform' else None
            executor.submit(collect_dataset_statistics,
                            dataset, container_name, prefix)

def push_report(container):
    try:
        if 'EXT' in os.environ:
            container += f"-{os.environ['EXT']}"
            if container.endswith('-'):
                container = container[:-1]
        blob_service_client = BlobServiceClient.from_connection_string(storage_cs)
        storage_container_client = blob_service_client.get_container_client(container)
        if storage_container_client.exists() == False:
            storage_container_client.create_container()
        name = str(report_name).split('/', 3)[-1]
        with open(report_name, "rb") as local_file:
            with storage_container_client.get_blob_client(name) as blob_client:
                blob_client.upload_blob(local_file, overwrite=OVERWRITE)
        local_file.close()
    except Exception as e:
        print(f'Error: {e.status_code} - {e.message}')

def collect_subproject_jobs():
    try:
        return cosmos.get_subproject_jobs(cosmos_cs)
    except Exception as e:
        print(f'Error: {e.message}')

def collect_partition_jobs():
    try:
        return cosmos.get_partition_jobs(cosmos_cs)
    except Exception as e:
        print(f'Error: {e.message}')

def job_schedule_check(job:cosmos.Job) -> bool:
    midnight_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
    today_utc = int(midnight_utc.timestamp() * 1000) # milliseconds

    difference = today_utc - job.first_execution
    freq = job.freq * 86400000 # days in milliseconds

    if today_utc < job.first_execution: # If first_execution day has not come
        return False
    if difference % freq == 0: # If difference is divisible by freq days
        return True
    return False

if __name__ == "__main__":

    start_time = time.time()

    if 'KEYVAULT_URL' not in os.environ:
        print("\nError: The KEYVAULT_URL variable is not set in the environment")
        sys.exit(1)

    if 'OSDU_SERVICES_HOST_URL' not in os.environ:
        print("\nError: The OSDU_SERVICES_HOST_URL variable is not set in the environment")
        sys.exit(1)
    
    args = sys.argv[1:]
    if len(args) > 1:
        print("\nUsage: collector.py <thread_num>\n")
        sys.exit(1)
    
    max_threads = int(args[0]) if len(args) > 0 else 32

    print(f'\n# Starting the collection script ({datetime.now(timezone.utc)})')

    # get list of partitions
    partition_List = partition.list_partitions()

    for partition_id in partition_List:

        try:
            # get connection strings
            partition_start_time = time.time()
            print(f'\n# initializing the collection task for {partition_id}')
            partition_configurations = partition.get_partition_configuration(partition_id)
            cosmos_cs = partition.get_cosmos_connection_string(partition_configurations)
            storage_cs = partition.get_storage_connection_string(partition_configurations)

            # jobs = collect_jobs()
            jobs = []
            subproject_list = []
            partition_jobs = []
            partition_job = collect_partition_jobs()
            exe_job = False
            if partition_job:
                if job_schedule_check(partition_job):
                    exe_job = True
                    subproject_list = cosmos.list_subproject(cosmos_cs)
                    for subproject in subproject_list:
                        jobs.append(
                            cosmos.Job(
                                subproject.name, partition_job.first_execution, partition_job.freq, partition_job.statistics))
            else:
                jobs = collect_subproject_jobs()

            for job in jobs:
                try:
                    if exe_job or job_schedule_check(job):
                        subproject_start_time = time.time()
                        subproject_name = job.name
                        statistics = Statistics([s.upper() for s in job.statistics.split(',')] )
                        # get subproject information
                        print(f'\n# get subproject {subproject_name} info\n')
                        sys.stdout.flush()
                        subproject = cosmos.get_subproject(subproject_name, cosmos_cs)
                        print(f'> name: {subproject.name}')
                        print(f'> policy: {subproject.policy}')
                        print(
                            f'> storage uri: {subproject.storage_url}{"-*" if subproject.policy != "uniform" else ""}')

                        # list all datasets in a subproject
                        print(f'\n# list datasets in {subproject_name}\n')
                        sys.stdout.flush()
                        datasets = cosmos.list_datasets(subproject_name, cosmos_cs)

                        print('\n# collect statistics from storage\n')
                        now = datetime.now(timezone.utc)

                        report_path = f'./results/{partition_id}/{subproject_name}/{now.year}/{"{:02d}".format(now.month)}/{"{:02d}".format(now.day)}'
                        if not os.path.exists(report_path):
                            os.makedirs(report_path)

                        report_name = f'{report_path}/report.csv'

                        file_out = FileWriter(report_name)
                        headers = 'name'
                        for attr, value in statistics.__dict__.items():
                            if value:
                                headers += f',{attr}'
                        file_out.write(headers)    
                        sys.stdout.flush()
                        collect_statistics(subproject, datasets)
                        file_out.close()

                        if utils.has_more_than_one_line(report_name):
                            print('\n# sort and push report to sdms')
                            utils.sort_csv_file(report_name)
                            push_report(STORAGE_CONTAINER_RESULTS)

                        if CLEANUP:
                            utils.clean_up_local(f'./results/{partition_id}/{subproject_name}/')

                        execution_time = time.time() - subproject_start_time
                        formatted_execution_time = utils.format_execution_time(execution_time)
                        print(f"\n# Task execution completed in {formatted_execution_time}")
                except Exception as e:
                    print(f'Error: {e}')
            execution_time = time.time() - partition_start_time
            formatted_execution_time = utils.format_execution_time(execution_time)
            print(f"\n# {partition_id} execution completed in {formatted_execution_time}")
        except Exception as e:
            print(f'Error: {e}')
    execution_time = time.time() - start_time
    formatted_execution_time = utils.format_execution_time(execution_time)
    print(f"\n# script execution completed in {formatted_execution_time}")

