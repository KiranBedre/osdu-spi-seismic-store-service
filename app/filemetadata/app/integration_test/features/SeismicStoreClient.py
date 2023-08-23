import logging

import requests


class SeismicStoreClient:

    def __init__(self, context):
        self.headers = {"Authorization": context.token}
        self.context = context

    def create_subproject(self):
        headers = self.headers.copy()
        headers['ltag'] = f"{self.context.sdms_tenant}-default-legal"
        resp = requests.post(self.context.subproject_url, headers=headers)
        resp.raise_for_status()

        logging.debug(f"Create subproject response={resp.text}")

    def delete_subproject(self):
        resp = requests.delete(self.context.subproject_url, headers=self.headers)

        logging.debug(f"Delete subproject response={resp.text}")

    def create_dataset(self, dataset_json, file_type):
        create_resp = requests.post(self.context.dataset_url, json={file_type: dataset_json}, headers=self.headers)
        create_resp.raise_for_status()

        logging.debug(f"Create dataset response={create_resp.text}")

    def get_dataset(self):
        params = {'seismicmeta': 'true', 'readonly': 'false'}
        get_resp = requests.get(self.context.dataset_url, headers=self.headers, params=params)
        get_resp.raise_for_status()

        logging.debug(f"Get dataset response={get_resp.text}")

        return get_resp.json()

    def patch_dataset(self, file_size, nobjects):
        record = {}
        record["type"] = "GENERIC"
        record["size"] = file_size
        record["nobjects"] = nobjects
        dataset_record = {}
        dataset_record['filemetadata'] = record

        patch_resp = requests.patch(self.context.dataset_url, json=dataset_record, headers=self.headers)
        patch_resp.raise_for_status()

        logging.debug(f"Patch dataset response={patch_resp.text}")

        return patch_resp.json()

    def delete_dataset(self):
        delete_resp = requests.delete(self.context.dataset_url, headers=self.headers)

        logging.debug(f"Delete dataset response={delete_resp.text}")

    def get_gcs_token(self, no_object):
        dataset = self.get_dataset()
        gcs_url = dataset['gcsurl'].split("/")

        params = {'sdpath': f'sd://{self.context.sdms_tenant}/{self.context.project_name}', 'readonly': 'false'}
        get_resp = requests.get(self.context.gcs_token_url, headers=self.headers, params=params)
        get_resp.raise_for_status()

        logging.debug(f"Get gcs response={get_resp.text}")

        return get_resp.json()['access_token'].replace(gcs_url[0], f"{dataset['gcsurl']}/{no_object}")
