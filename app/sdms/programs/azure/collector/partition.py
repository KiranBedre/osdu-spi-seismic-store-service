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

import requests
import os

from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

class Secret:
    def __init__(self, sensitive, value):
        self.sensitive: bool = sensitive
        self.value: str = value

def get_secret(id):
    vault_name = os.environ['KEYVAULT_URL']
    URL: str = vault_name if vault_name.startswith('https') else f'https://{vault_name}.vault.azure.net/'
    credential = DefaultAzureCredential()
    secret_client = SecretClient(vault_url=URL, credential=credential)
    secret = secret_client.get_secret(id).value
    return secret

def get_sp_token():
    credential = DefaultAzureCredential()
    app_resource_id = get_secret("aad-client-id")
    token = credential.get_token(app_resource_id + '/.default').token
    return token

def get_storage_connection_string(partition_configs):
    account_name = partition_configs['sdms-storage-account-name']
    account_key = partition_configs['sdms-storage-account-key']

    secret_name: Secret = Secret(account_name.get("sensitive"), account_name.get("value"))
    secret_key: Secret = Secret(account_key.get("sensitive"), account_key.get("value"))

    if secret_name.sensitive:
        secret_name.value = get_secret(secret_name.value)

    if secret_key.sensitive:
        secret_key.value = get_secret(secret_key.value)

    return f"DefaultEndpointsProtocol=https;AccountName={secret_name.value};AccountKey={secret_key.value};EndpointSuffix=core.windows.net"

def get_cosmos_connection_string(partition_configs):
    cosmos_endpoint = partition_configs['cosmos-endpoint']
    cosmos_key = partition_configs['cosmos-primary-key']

    secret_endpoint: Secret = Secret(cosmos_endpoint.get("sensitive"), cosmos_endpoint.get("value"))
    secret_key: Secret = Secret(cosmos_key.get("sensitive"), cosmos_key.get("value"))

    if secret_endpoint.sensitive:
        secret_endpoint.value = get_secret(secret_endpoint.value)

    if secret_key.sensitive:
        secret_key.value = get_secret(secret_key.value)
    
    return f'AccountEndpoint={secret_endpoint.value};AccountKey={secret_key.value}'

def get_partition_configuration(data_partition_id:str):
    token = get_sp_token()
    osdu_services_host = os.environ['OSDU_SERVICES_HOST_URL']
    headers = {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + str(token),
            'Content-Type': 'application/json'
    }
    url = f"{osdu_services_host}/api/partition/v1/partitions/{data_partition_id}"
    response = requests.get(url, headers=headers)
    
    return response.json()

def list_partitions():
    token = get_sp_token()
    osdu_services_host = os.environ['OSDU_SERVICES_HOST_URL']
    headers = {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + str(token),
            'Content-Type': 'application/json'
    }
    url = f"{osdu_services_host}/api/partition/v1/partitions"
    response = requests.get(url, headers=headers)
    
    return response.json()
