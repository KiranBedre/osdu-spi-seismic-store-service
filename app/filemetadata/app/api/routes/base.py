from fastapi import APIRouter

from api.routes.shared import route_status_v1, route_status
from api.routes.v1 import route_segy, route_openzgy
from api.routes.v2 import route_segy as segy2, route_openzgy as openzgy2

api_router = APIRouter()

api_router.include_router(route_status_v1.router)
api_router.include_router(route_segy.router)
api_router.include_router(route_openzgy.router)

api_router.include_router(route_status.router)
api_router.include_router(segy2.router)
api_router.include_router(openzgy2.router)