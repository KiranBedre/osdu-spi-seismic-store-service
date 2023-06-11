import unittest

from fastapi.testclient import TestClient
from api.routes.shared.route_status_v1 import router
from core.config import Settings
from unit.util import apply_test_settings

client = TestClient(router)


class RouteStatusTest(unittest.TestCase):

    def test_route_service_status(self):
        apply_test_settings()
        response = client.get(Settings.BASE_URL + Settings.API_PATH + "service-status")
        assert response.status_code == 200
        assert response.json() == {'status': 'ok'}