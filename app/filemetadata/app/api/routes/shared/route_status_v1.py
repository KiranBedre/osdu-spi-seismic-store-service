from .description import Role, api_description
from fastapi import APIRouter

from core.config import settings
VERSION = 1

router = APIRouter()
PATH = settings.API_PATH + 'v' + str(VERSION) + '/'

@router.get(PATH + "service-status", tags=["General (DEPRECATED)"], description=api_description("service status", Role.none, False))
def get_status():
    return {"status": "ok"}