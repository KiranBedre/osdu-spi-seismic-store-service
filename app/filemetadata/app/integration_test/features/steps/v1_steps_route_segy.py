import json

import requests
from behave import *

from core.config import Settings

def __get_default_header(context):
    return {"Authorization": context.token, "appkey": Settings.SVC_API_KEY, "content": 'application/json'}

def __assert_message(request_url, response):
    return f"Calling GET {request_url} -> {response.status_code} - {response.text}"

@when('v1_revision endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/revision?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_revision response should have value {value}')
def step_impl(context, value):
    assert str(context.response.json()) == value


@when('v1_is3D endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/is3D?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_is3D response should have value {value}')
def step_impl(context, value):
    assert str(context.response.json()) == value


@when('v1_traceHeaderFieldCount endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/traceHeaderFieldCount?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_traceHeaderFieldCount response should have value {value}')
def step_impl(context, value):
    assert str(context.response.json()) == value


@when('v1_textualHeader endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/textualHeader?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_textualHeader response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        expected = json.load(fp)
        received = context.response.json()
        assert received == expected, f"Expected: {json.dumps(expected)}\nBut got: {json.dumps(received)}"


@when('v1_extendedTextualHeaders endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/extendedTextualHeaders?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_extendedTextualHeaders response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        expected = json.load(fp)
        received = context.response.json()
        received["header"] = json.loads(received["header"])
        assert received == expected, f"Expected: {json.dumps(expected)}\nBut got: {json.dumps(received)}"


@when('v1_binaryHeader endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/binaryHeader?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_binaryHeader response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        expected = json.load(fp)
        received = json.loads(context.response.json())
        assert received == expected, f"Expected: {json.dumps(expected)}\nBut got: {json.dumps(received)}"


@when('v1_rawTraceHeaders endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/rawTraceHeaders?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}&traces_to_dump=100&start_trace=1'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_rawTraceHeaders response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        expected = json.load(fp)
        received = context.response.json()
        received["header"] = json.loads(received["header"])
        del expected["header"]["metadata"]["Filenames"]
        del received["header"]["metadata"]["Filenames"]
        assert received == expected, f"Expected: {json.dumps(expected)}\nBut got: {json.dumps(received)}"


@when('v1_scaledTraceHeaders endpoint is called')
def step_impl(context):
    request_url = f'{Settings.BASE_API_URL_v1}/segy/scaledTraceHeaders?sdpath=sd://{context.sdms_tenant}/{context.subproject_name}/{context.dataset_id}&traces_to_dump=100&start_trace=1'
    response = requests.get(request_url, headers=__get_default_header(context))
    context.response = response
    assert response.status_code == 200, __assert_message(request_url, response)


@then('v1_scaledTraceHeaders response should have value {file_name}')
def step_impl(context, file_name):
    with open(f'{context.dir_path}/data/{file_name}') as fp:
        expected = json.load(fp)
        received = context.response.json()
        received["header"] = json.loads(received["header"])
        del expected["header"]["metadata"]["Filenames"]
        del received["header"]["metadata"]["Filenames"]
        assert received == expected, f"Expected: {json.dumps(expected)}\nBut got: {json.dumps(received)}"
