import sys
from unittest.mock import Mock

sys.modules["segysdk"] = Mock()
sys.modules["azure.monitor.opentelemetry"] = Mock()
sys.modules["azure.monitor.opentelemetry.exporter"] = Mock()
sys.modules["azure.monitor.opentelemetry.exporter.export"] = Mock()
sys.modules["azure.monitor.opentelemetry.exporter.export.logs"] = Mock()
sys.modules["azure.monitor.opentelemetry.exporter.export.logs._exporter"] = Mock()
sys.modules["opentelemetry.sdk._logs"] = Mock()

import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.routes.v1.route_segy import router

BASE_PATH = "/seismic-file-metadata/api/v1/segy"
TEST_SDPATH = "sd://opendes/kt-demo/example.sgy"

TEST_HEADERS = {
    "content": "application/json",
    "appkey": "xvz1evFS4wEEPTGEFPHBog",
    "Authorization": "AAAAAAAAAAAAAAAAAAAAAMLheAAAAAAA0%2BuSeid%2BULvsea4JtiGRiSDSJSI%3DEUifiRBkKG5E2XzMDjRfl76ZC9Ub0wnz4XsNiRVBChTYbJcE3F",
}


def _make_url(endpoint: str, **params) -> str:
    params["sdpath"] = TEST_SDPATH
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{BASE_PATH}/{endpoint}?{query}"


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


@mock.patch("api.routes.v1.route_segy.__create_segy_session")
class RouteSegyTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.app = FastAPI()
        cls.app.include_router(router)
        cls.client = TestClient(cls.app)

    def setUp(self):
        self.mock_session = MockSegySession()

    def _get(self, mock_create_segy_session, endpoint: str, **params):
        mock_create_segy_session.return_value = self.mock_session
        return self.client.get(_make_url(endpoint, **params), headers=TEST_HEADERS)

    def test_segy_revision(self, mock_create_segy_session):
        response = self._get(mock_create_segy_session, "revision")
        assert response.status_code == 200
        assert response.text == "1"

    def test_segy_is3D(self, mock_create_segy_session):
        response = self._get(mock_create_segy_session, "is3D")
        assert response.status_code == 200
        assert response.text == "true"

    def test_segy_traceHeaderFieldCount(self, mock_create_segy_session):
        response = self._get(mock_create_segy_session, "traceHeaderFieldCount")
        assert response.status_code == 200
        assert response.text == "10"

    def test_segy_textualHeader(self, mock_create_segy_session):
        response = self._get(mock_create_segy_session, "textualHeader")
        assert response.status_code == 200
        assert response.json() == {"header": "TextualheaderValue"}

    def test_segy_extendedTextualHeaders(self, mock_create_segy_session):
        response = self._get(mock_create_segy_session, "extendedTextualHeaders")
        assert response.status_code == 200
        assert response.json() == {"header": "ExtendedTextualHeadersValue"}

    def test_segy_binaryHeader(self, mock_create_segy_session):
        response = self._get(mock_create_segy_session, "binaryHeader")
        assert response.status_code == 200
        assert response.json() == {"header": "binaryHeaderValue"}

    def test_segy_rawTraceHeaders(self, mock_create_segy_session):
        response = self._get(
            mock_create_segy_session, "rawTraceHeaders", traces_to_dump=5, start_trace=1
        )
        assert response.status_code == 200
        assert response.json() == {"header": "rawTraceHeadersValue"}

    def test_segy_scaledTraceHeaders(self, mock_create_segy_session):
        response = self._get(
            mock_create_segy_session,
            "scaledTraceHeaders",
            traces_to_dump=5,
            start_trace=1,
        )
        assert response.status_code == 200
        assert response.json() == {"header": "scaledTraceHeadersValue"}
