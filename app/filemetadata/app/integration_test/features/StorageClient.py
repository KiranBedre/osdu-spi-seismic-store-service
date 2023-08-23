import logging

import requests


class StorageClient:

    def __init__(self, context):
        self.headers = {
            "Authorization": context.token,
            "data-partition-id": context.sdms_tenant
        }
        self.context = context

    def get_record(self, record_id):
        url = f'{self.context.storage_url}/records/{record_id}'
        record_resp = requests.get(url, headers=self.headers)
        record_resp.raise_for_status()

        logging.debug(f"record resp = {record_resp.text}")

        return record_resp.json()

    def put_record(self, record_payload):
        url = f'{self.context.storage_url}/records'
        record_resp = requests.put(url, json=record_payload, headers=self.headers)
        record_resp.raise_for_status()
        
        logging.debug(f"record_resp = {record_resp.text}")

        return record_resp.json()

    def delete_record(self, record_id):
        url = f'{self.context.storage_url}/records/{record_id}:delete'
        record_resp = requests.post(url, json={}, headers=self.headers)

        logging.debug(f"record delete resp = {record_resp.text}")

    @staticmethod
    def store_blob(url, file):
        headers = {'Content-Type': 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob'}
        resp = requests.put(url=url, data=file, headers=headers)

        resp.raise_for_status()

    @staticmethod
    def get_blob(url):
        resp = requests.get(url=url)
        resp.raise_for_status()

        return resp.content
