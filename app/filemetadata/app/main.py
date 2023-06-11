import uvicorn

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html, get_swagger_ui_oauth2_redirect_html
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from api.errors.http_error import http_error_handler
from api.errors.validation_error import http422_error_handler
from api.routes.base import api_router
from core.config import settings

def start_application():
    application = FastAPI(title=settings.PROJECT_TITLE, version=settings.PROJECT_VERSION,
                          docs_url=None, redoc_url=None, openapi_url=settings.API_PATH + 'openapi.json')

    application.add_exception_handler(HTTPException, http_error_handler)
    application.add_exception_handler(RequestValidationError, http422_error_handler)

    application.include_router(api_router)
    application.mount(settings.API_PATH + "static", StaticFiles(directory="static"), name="static")

    application.add_middleware(
        CORSMiddleware,
        expose_headers=["Content-Security-Policy"]
    )

    return application


app = start_application()


@app.get(settings.API_PATH + "swagger-ui.html", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title + " - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url=settings.API_PATH + "static/swagger-ui/swagger-ui-bundle.js",
        swagger_css_url=settings.API_PATH + "static/swagger-ui/swagger-ui.css",
        swagger_favicon_url=""
    )


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    response = await call_next(request)

    response.headers[
        "Content-Security-Policy"] = "script-src 'unsafe-inline' 'self'"
    return response


@app.get(app.swagger_ui_oauth2_redirect_url, include_in_schema=False)
async def swagger_ui_redirect():
    return get_swagger_ui_oauth2_redirect_html()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)