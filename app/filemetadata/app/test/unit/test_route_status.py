import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.routes.shared.route_status import router
from api.routes.shared.route_status_v1 import router as router2


class RouteStatusTest(unittest.TestCase):

    def test_route_service_status(self):
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        response = client.get("/seismic-file-metadata/api/service-status")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_route_service_status_v1(self):
        app = FastAPI()
        app.include_router(router2)
        client = TestClient(app)
        response = client.get("/seismic-file-metadata/api/v1/service-status")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
