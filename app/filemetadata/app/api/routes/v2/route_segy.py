import json
import re
import segysdk

from ..shared.description import Role, api_description
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security.api_key import APIKey
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

from api.dependencies.authentication import get_bearer, get_api_key, configure_remote_access
from core.config import settings
from loggers.azure.insights import AzureInsightsLogger
VERSION = 2

router = APIRouter()
PATH = settings.API_PATH + 'v' + str(VERSION) + '/'

def internal_server_error(e: Exception): 
    return HTTPException(status_code=HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

def segy_error(se: segysdk.SegyException):
    message = str(se)
    matched = re.search('HTTP [0-9][0-9][0-9]', message)
    if(matched):
        http_error = int(matched.group().split()[1])
        return HTTPException(status_code=http_error, detail=message)
    
    return HTTPException(status_code=HTTP_500_INTERNAL_SERVER_ERROR, detail=message)


@router.get(PATH + "segy/revision",  tags=["SEGY"], description=api_description("revision", Role.viewer))
async def get_revision(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        revision = segy.get_revision()
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return revision

@router.get(PATH + "segy/is3D", tags=["SEGY"], description=api_description("1 if given dataset is 3D", Role.viewer, False))
async def get_is_3d(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        is_3d = segy.is_3d()
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return is_3d == 1

@router.get(PATH + "segy/traceHeaderFieldCount", tags=["SEGY"], description=api_description("trace header field count", Role.viewer))
async def get_trace_header_field_count(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        count = segy.get_trace_header_field_count()
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return count

@router.get(PATH + "segy/textualHeader", tags=["SEGY"], description=api_description("textual header", Role.viewer))
async def get_textual_header(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        ascii_headers_as_json = segy.get_ascii_headers_as_json()
        json_header = json.loads(ascii_headers_as_json)["Textualheader"]
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return {"header": f"{json_header}"}

@router.get(PATH + "segy/extendedTextualHeaders", tags=["SEGY"], description=api_description("extended textual headers", Role.viewer))
async def get_extended_textual_headers(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        get_extended_ascii_headers_as_json = segy.get_extended_ascii_headers_as_json()
        json_header = json.loads(get_extended_ascii_headers_as_json)
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return {"header": json_header}

@router.get(PATH + "segy/binaryHeader", tags=["SEGY"], description=api_description("binary header", Role.viewer))
async def get_binary_header(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        header = segy.get_binary_header_as_json()
        json_header = json.loads(header)
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return {"header": json_header}

@router.get(PATH + "segy/rawTraceHeaders", tags=["SEGY"], description=api_description("raw trace headers", Role.viewer))
async def get_raw_trace_headers(
        sdpath: str,
        start_trace: int,
        traces_to_dump: int,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        header = segy.get_raw_trace_headers_as_json(start_trace, traces_to_dump)
        json_header = json.loads(header)
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return {"header": json_header}

@router.get(PATH + "segy/scaledTraceHeaders", tags=["SEGY"], description=api_description("scaled trace headers", Role.viewer))
async def get_scaled_trace_headers(
        sdpath: str,
        start_trace: int,
        traces_to_dump: int,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    segy = __create_segy_session(bearer, api_key, sdpath)
    try:
        header = segy.get_scaled_trace_headers_as_json(start_trace, traces_to_dump)
        json_header = json.loads(header)
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))

    return {"header": json_header}

def __create_segy_session(bearer, api_key, sdpath):
    try:
        configure_remote_access(bearer, api_key)
        return segysdk.create_session(sdpath, '{}')    
    except segysdk.SegyException as se:
        raise AzureInsightsLogger.error(segy_error(se))
    except Exception as e:
        raise AzureInsightsLogger.error(internal_server_error(e))