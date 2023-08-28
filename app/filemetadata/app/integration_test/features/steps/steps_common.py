import logging

import requests
from behave import *

from core.config import Settings

from features.SeismicStoreClient import SeismicStoreClient
from features.StorageClient import StorageClient


@given('create config')
def step_impl(context):
    context.headers = {"Authorization": context.token}


@given('create subproject')
def step_impl(context):
    headers = context.headers.copy()
    headers['ltag'] = context.legal_tag

    resp = requests.post(context.subproject_url, json={}, headers=headers)
    
    assert resp.status_code == 200, f"Creating subproject {context.subproject_url} -> {resp.status_code} - {resp.text}"


@given('create dataset with id {dataset_id}')
def step_impl(context, dataset_id: str):
    context.dataset_id = dataset_id
    context.dataset_url = f'{Settings.SEISTORE_SVC_URL}/dataset/tenant/{context.sdms_tenant}/subproject/{context.subproject_name}/dataset/{dataset_id}'
    create_resp = requests.post(context.dataset_url, json={}, headers=context.headers)
    assert create_resp.status_code == 200, f"Creating dataset {context.dataset_url} -> {create_resp.status_code} - {create_resp.text}"


@given('upload dataset with id {dataset_id}')
def step_impl(context, dataset_id):
    seismic_client = SeismicStoreClient(context=context)

    with open(f"{context.dir_path}/data/{dataset_id}", 'rb') as record:
        storage_client = StorageClient(context=context)
        data = record.read()
        data_1 = data[:int(len(data) / 2)]
        data_2 = data[int(len(data) / 2):]
        gcs_token_url_1 = seismic_client.get_gcs_token(0)
        gcs_token_url_2 = seismic_client.get_gcs_token(1)
        storage_client.store_blob(url=gcs_token_url_1, file=data_1)
        storage_client.store_blob(url=gcs_token_url_2, file=data_2)
        blob_content_1 = storage_client.get_blob(url=gcs_token_url_1)
        assert data_1 == blob_content_1, "First blob is corrupted."
        blob_content_2 = storage_client.get_blob(url=gcs_token_url_2)
        assert data_2 == blob_content_2, "Last blob is corrupted."

        # patch dataset
        seismic_client.patch_dataset(len(data), 2)
        unlock_response = requests.put(
            f'{Settings.SEISTORE_SVC_URL}/dataset/tenant/{context.sdms_tenant}/subproject/{context.subproject_name}/dataset/{dataset_id}/unlock?path=%2F',
            headers=context.headers)
        assert unlock_response.status_code == 200, f"Unlocking dataset: {unlock_response.status_code} - {unlock_response.text}"
