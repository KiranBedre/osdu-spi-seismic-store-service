import logging
import os
import sys
import uuid
from pathlib import Path

import requests

path = Path(__file__).parent.parent.parent.resolve()

sys.path.append(str(path))

from util import apply_test_settings
from core.config import Settings


def before_feature(context, feature):
    apply_test_settings()
    context.dir_path = os.path.dirname(os.path.realpath(__file__))
    context.subproject_name = f"integration{uuid.uuid4().hex}"
    context.project_name = context.subproject_name
    context.storage_url = Settings.STORAGE_SVC_URL
    context.gcs_token_url = f'{Settings.SEISTORE_SVC_URL}/utility/gcs-access-token'
    context.sdms_tenant = Settings.PARTITION
    context.legal_tag = Settings.LEGAL_TAG
    context.token = Settings.TOKEN
    context.subproject_url = f'{Settings.SEISTORE_SVC_URL}/subproject/tenant/{context.sdms_tenant}/subproject/{context.subproject_name}'


def after_scenario(context, scenario):
    if scenario.feature.name != 'Route status integration test':
        delete_dataset_resp = requests.delete(context.dataset_url, headers=context.headers)
        logging.info(f"Delete dataset status_code={delete_dataset_resp.status_code}")
        delete_project_resp = requests.delete(context.subproject_url, headers=context.headers)
        logging.info(f"Delete project status_code={delete_project_resp.status_code}")
