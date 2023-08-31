import requests
from behave import *

from core.config import Settings

@when('service-status endpoint is called')
def step_impl(context):
    request_url = Settings.BASE_URL+"/service-status"
    response = requests.get(request_url)
    context.response = response
    assert response.status_code == 200, f"Calling GET {request_url} -> {response.status_code} - {response.text}"

@then('service-status response should have value {service_status_response}')
def step_impl(context, service_status_response):
    assert str(context.response.json()) == service_status_response
