from applicationinsights import TelemetryClient
from fastapi import Request
from core.config import settings
from loggers.model.log import Log
from .keyvault import KeyVault

class AzureInsightsLogger():

    ENABLE_LOGGING: bool = True if settings.FEATURE_FLAG_LOGGING == 'true' else False

    if ENABLE_LOGGING:
        try:
            tc = TelemetryClient(KeyVault.getInsightsKey())
            tc.context.cloud.role = 'seismic-filemetadata'
        except Exception as ex:
            print(ex)
            print('LOGGING NOT ENABLED')
            ENABLE_LOGGING = False

    CORRELATION_ID: str

    @staticmethod
    def info(data: dict):
        if AzureInsightsLogger.ENABLE_LOGGING:
            AzureInsightsLogger.tc.track_trace(data.get('message'), data.get('properties'), "INFO")

    @staticmethod
    def request(request: Request, response, time):
        if AzureInsightsLogger.ENABLE_LOGGING:
            result = Log(request, response, time)
            AzureInsightsLogger.tc.context.operation.name = result.operation_Name
            AzureInsightsLogger.tc.track_request(result.name, result.url, result.success, response_code=result.response_code, duration=result.duration, properties={'correlation-id': AzureInsightsLogger.CORRELATION_ID, 'data-partition-id': result.tenant, 'user-id': request.headers.get('x-user-id')})
            AzureInsightsLogger.tc.flush()
    
    @staticmethod
    def error(exception):
        if AzureInsightsLogger.ENABLE_LOGGING:
            AzureInsightsLogger.tc.track_exception(exception, properties={'correlation-id': AzureInsightsLogger.CORRELATION_ID})
        return exception

    @staticmethod
    def buildTraceInfo(request: Request):
        present = AzureInsightsLogger.isPresent(request.query_params.get('sdpath'))
        telemetry = {
            "message": '[' + request.method + '] ' + str(request.url),
            "properties": {
                'correlation-id': AzureInsightsLogger.CORRELATION_ID,
                'data-partition-id': request.query_params.get("sdpath")[len('sd://'):].split('/')[0] if present else None,
                'user-id': request.headers.get('x-user-id')
                }
        }
        return(telemetry)
    
    def isPresent(sdpath: str):
        if not sdpath.startswith('sd://'):
            return False
        return True