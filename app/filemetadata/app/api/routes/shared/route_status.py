from .description import Role, api_description
from fastapi import APIRouter

from core.config import settings

router = APIRouter()

@router.get(settings.API_PATH + "service-status", tags=["General"], description=api_description("service status", Role.none, False))
def get_status():
    return {"status": "ok"}