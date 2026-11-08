"""Application error type rendered as a consistent JSON error body."""
from __future__ import annotations


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        retry_after_seconds: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable
        self.retry_after_seconds = retry_after_seconds

    def to_body(self) -> dict:
        body: dict = {"code": self.code, "message": self.message, "retryable": self.retryable}
        if self.retry_after_seconds is not None:
            body["retry_after_seconds"] = self.retry_after_seconds
        return {"error": body}
