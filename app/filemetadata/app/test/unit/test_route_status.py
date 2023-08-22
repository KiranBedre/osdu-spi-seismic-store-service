import unittest

from fastapi.testclient import TestClient
from api.routes.shared.route_status import router
from api.routes.shared.route_status_v1 import router as router2
from core.config import Settings
from unit.util import apply_test_settings


class RouteStatusTest(unittest.TestCase):

    def test_route_service_status(self):
        client = TestClient(router)
        apply_test_settings()
        response = client.get(Settings.BASE_URL + Settings.API_PATH + "service-status")
        assert response.status_code == 200
        assert response.json() == {'status': 'ok'}

    def test_route_service_status_v1(self):
        client = TestClient(router2)
        apply_test_settings()
        response = client.get(Settings.BASE_URL + Settings.API_PATH + "v1/service-status")
        assert response.status_code == 200
        assert response.json() == {'status': 'ok'}