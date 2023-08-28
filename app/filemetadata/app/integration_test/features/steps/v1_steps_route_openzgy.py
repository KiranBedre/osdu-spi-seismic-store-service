import json

import requests
from behave import *

from core.config import Settings

@when('v1_bingrid endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/openzgy/bingrid?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    headers = {"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'}
    response = requests.get(request_url, headers=headers)
    context.response = response
    assert response.status_code == 200, f"Calling GET {request_url} -> {response.status_code} - {response.text}"


@then('v1_bingrid response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        expected = json.load(fp)
        print(context.response.json())
        received = json.loads(context.response.json())
        assert received == expected, f"Expected: {json.dumps(expected)}\nBut got: {json.dumps(received)}"
