import sys
from unittest.mock import Mock

sys.modules['segysdk'] = Mock()

import unittest
from unittest import mock

from fastapi.testclient import TestClient
from api.routes.v1.route_segy import router
from core.config import Settings
from unit.util import apply_test_settings

client = TestClient(router)

TEST_HEADERS = {
    'content': 'application/json',
    'appkey': 'xvz1evFS4wEEPTGEFPHBog',
    'Authorization': 'AAAAAAAAAAAAAAAAAAAAAMLheAAAAAAA0%2BuSeid%2BULvsea4JtiGRiSDSJSI%3DEUifiRBkKG5E2XzMDjRfl76ZC9Ub0wnz4XsNiRVBChTYbJcE3F',
}


class MockSegySession:

    def __init__(self):
        self.revision = 1
        self.is3d = True
        self.trace_header_field_count = 10
        self.ascii_headers_as_json = '{"Textualheader": "TextualheaderValue"}'
        self.extended_ascii_headers_as_json = '"ExtendedTextualHeadersValue"'
        self.binary_header_as_json = "binaryHeaderValue"
        self.raw_trace_headers_as_json = "rawTraceHeadersValue"
        self.scaled_trace_headers_as_json = "scaledTraceHeadersValue"

    def get_revision(self):
        return self.revision

    def is_3d(self):
        return self.is3d

    def get_trace_header_field_count(self):
        return self.trace_header_field_count

    def get_ascii_headers_as_json(self):
        return self.ascii_headers_as_json

    def get_extended_ascii_headers_as_json(self):
        return self.extended_ascii_headers_as_json

    def get_binary_header_as_json(self):
        return self.binary_header_as_json

    def get_raw_trace_headers_as_json(self, start_trace, traces_to_dump):
        return self.raw_trace_headers_as_json

    def get_scaled_trace_headers_as_json(self, start_trace, traces_to_dump):
        return self.scaled_trace_headers_as_json


apply_test_settings()


@mock.patch('api.routes.v1.route_segy.__create_segy_session')
class RouteSegyTest(unittest.TestCase):

    def test_segy_revision(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/revision?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.text == '1'

    def test_segy_is3D(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/is3D?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.text == 'true'

    def test_segy_traceHeaderFieldCount(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/traceHeaderFieldCount?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.text == '10'

    def test_segy_textualHeader(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/textualHeader?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.json() == {"header": "TextualheaderValue"}

    def test_segy_extendedTextualHeaders(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/extendedTextualHeaders?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.json() == {"header": "ExtendedTextualHeadersValue"}

    def test_segy_binaryHeader(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/binaryHeader?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.json() == {"header": "binaryHeaderValue"}

    def test_segy_rawTraceHeaders(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/rawTraceHeaders?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy&traces_to_dump=5&start_trace=1",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.json() == {"header": "rawTraceHeadersValue"}

    def test_segy_scaledTraceHeaders(self, mock_create_segy_session):
        mock_create_segy_session.return_value = MockSegySession()
        response = client.get(
            Settings.BASE_URL + Settings.API_PATH + "segy/scaledTraceHeaders?sdpath=sd%3A%2F%2Fopendes%2Fkt-demo%2Fexample.sgy&traces_to_dump=5&start_trace=1",
            headers=TEST_HEADERS)
        assert response.status_code == 200
        assert response.json() == {"header": "scaledTraceHeadersValue"}