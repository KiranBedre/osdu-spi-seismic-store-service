from fastapi import Request
from opentelemetry import trace
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry.trace.status import Status, StatusCode
from opentelemetry.trace import SpanKind, Tracer
from core.config import settings
from loggers.model.log import Log
from .keyvault import KeyVault
import logging
import os

class AzureInsightsLogger():

    ENABLE_LOGGING: bool = True if settings.FEATURE_FLAG_LOGGING == 'true' else False

    APP_NAME: str

    LOGGER: logging

    TRACER: Tracer

    def init(app_name):
        if AzureInsightsLogger.ENABLE_LOGGING:
            try:
                AzureInsightsLogger.APP_NAME = app_name
                os.environ["OTEL_RESOURCE_ATTRIBUTES"] = "service.instance.id=" + AzureInsightsLogger.APP_NAME
                os.environ["OTEL_SERVICE_NAME"] = AzureInsightsLogger.APP_NAME
                connection_string=KeyVault.getInsightsConnectionString()
                # set the tracer provider
                AzureInsightsLogger.TRACER = trace.get_tracer(AzureInsightsLogger.APP_NAME)
                AzureInsightsLogger.LOGGER = logging.getLogger(AzureInsightsLogger.APP_NAME)
                AzureInsightsLogger.LOGGER.setLevel(logging.INFO)
                configure_azure_monitor(
                    connection_string=connection_string,
                    logger_name=AzureInsightsLogger.APP_NAME,
                    disable_offline_storage=True
                )
            except Exception as ex:
                AzureInsightsLogger.LOGGER.error('LOGGING DISABLED, ' + ex)
                ENABLE_LOGGING = False

    CORRELATION_ID: str
    OPERATION_ID: str

    @staticmethod
    def info(data: dict):
        if AzureInsightsLogger.ENABLE_LOGGING:
            AzureInsightsLogger.LOGGER.info(data.get("message", "No message provided"),extra=data.get("properties", {}))

    @staticmethod
    def request(request: Request, response, time):
        if AzureInsightsLogger.ENABLE_LOGGING:
            result = Log(request, response, time)
            with AzureInsightsLogger.TRACER.start_as_current_span(
                result.operation_Name,
                kind=SpanKind.SERVER
            ) as span:
                span.set_attribute("name", result.name)
                span.set_attribute("url", str(request.url))
                span.set_attribute("success", result.success)
                span.set_attribute("resultCode", result.response_code)
                span.set_attribute("duration", result.duration)                
                span.set_attribute(
                    "correlation-id", AzureInsightsLogger.CORRELATION_ID
                )
                span.set_attribute(
                    "data-partition-id", result.tenant
                )
                span.set_attribute("user_id", request.headers.get("x-user-id"))
                span.set_attribute("request_id", AzureInsightsLogger.OPERATION_ID)
                span.add_event("Request Processed")
                span.set_status(
                    Status(
                        status_code=StatusCode.OK if result.success else StatusCode.ERROR
                    )
                )
                extra={
                    "correlation-id": AzureInsightsLogger.CORRELATION_ID,
                    "data-partition-id": result.tenant,
                    "user-id": request.headers.get("x-user-id")
                }
                AzureInsightsLogger.LOGGER.info(result.name + str(result.success), extra=extra)
    
    @staticmethod
    def error(exception):
        if AzureInsightsLogger.ENABLE_LOGGING:
            with AzureInsightsLogger.TRACER.start_as_current_span("log_error") as span:
                span.record_exception(exception)
                span.set_status(Status(StatusCode.ERROR, str(exception)))
                span.set_attribute("correlation-id", AzureInsightsLogger.CORRELATION_ID)
                extra={
                    "correlation-id": AzureInsightsLogger.CORRELATION_ID
                }
                AzureInsightsLogger.LOGGER.error(str(exception), extra=extra)
        return exception

    @staticmethod
    def buildTraceInfo(request: Request):
        if AzureInsightsLogger.ENABLE_LOGGING:
            present = AzureInsightsLogger.isPresent(request.query_params.get("sdpath"))
            telemetry = {
                "message": f"[{request.method}] {request.url}",
                "properties": {
                    "correlation-id": AzureInsightsLogger.CORRELATION_ID,
                    "data-partition-id": request.query_params.get("sdpath")[
                        len("sd://") :
                    ].split("/")[0]
                    if present
                    else None,
                    "user-id": request.headers.get("x-user-id"),
                },
            }
            return telemetry
    
    def isPresent(sdpath: str):
        if not sdpath.startswith('sd://'):
            return False
        return True