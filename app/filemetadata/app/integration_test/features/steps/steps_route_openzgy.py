import json

import requests
from behave import *

from core.config import Settings


@when('bingrid endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL}/openzgy/bingrid?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    headers = {"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'}
    response = requests.get(request_url, headers=headers)
    context.response = response
    assert response.status_code == 200, f"Calling GET {request_url} -> {response.status_code} - {response.text}"


@then('bingrid response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        expected = json.load(fp)
        received = context.response.json()
        assert received == expected, f"Expected: {json.dumps(expected)}\nBut got: {json.dumps(received)}"
