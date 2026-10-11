import logging
from collections.abc import Callable

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("group_app")

DEFAULT_SERVER_ERROR = "Internal server error"


def fails_with(message: str):
    """Route dependency that sets the message returned if the handler crashes."""

    def set_message(request: Request) -> None:
        request.state.error_message = message

    return Depends(set_message)


class SafeRoute(APIRoute):
    """Turns unexpected exceptions into the `{"error": ...}` 500 body the frontend expects."""

    def get_route_handler(self) -> Callable:
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                return await original(request)
            except (StarletteHTTPException, RequestValidationError):
                raise
            except Exception:
                logger.exception("Unhandled error on %s %s", request.method, request.url.path)
                message = getattr(request.state, "error_message", DEFAULT_SERVER_ERROR)
                return JSONResponse({"error": message}, status_code=500)

        return handler


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse({"error": "Invalid request"}, status_code=400)
