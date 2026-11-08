"""Request schema for article analysis."""
from __future__ import annotations

from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    title: str = Field(min_length=1, max_length=500)
    url: str = Field(min_length=1, max_length=2048)
    content: str = Field(min_length=1, description="Readable article text extracted by the extension.")
    author: str | None = Field(default=None, max_length=300)
    published_date: str | None = Field(default=None, max_length=100)
    site_name: str | None = Field(default=None, max_length=200)
    language: str | None = Field(default=None, max_length=35)

    @field_validator("url")
    @classmethod
    def url_must_be_http(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url must be an http(s) URL")
        return value

    @field_validator("author", "published_date", "site_name", "language")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        return value or None
