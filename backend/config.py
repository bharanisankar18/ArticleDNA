"""Application settings, loaded from environment variables (and backend/.env when present)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent
APP_VERSION = "1.0.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Gemini
    gemini_api_key: str = Field(default="", repr=False)
    gemini_model: str = "gemini-3.6-flash"
    gemini_timeout_seconds: float = Field(default=120.0, gt=0)
    gemini_max_retries: int = Field(default=2, ge=0, le=5)
    gemini_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    gemini_max_output_tokens: int = Field(default=32768, ge=1024)

    # Fallback providers, tried in order when the one before is rate limited or unavailable.
    # Any OpenAI-compatible API works; these three are built in.
    ai_providers: str = "gemini,groq,openrouter,ollama"
    groq_api_key: str = Field(default="", repr=False)
    groq_model: str = "openai/gpt-oss-120b"
    groq_max_chars: int = 24_000  # Groq's free tier allows few tokens per minute
    groq_max_output_tokens: int = 4096
    openrouter_api_key: str = Field(default="", repr=False)
    openrouter_model: str = "google/gemma-4-31b-it:free"
    openrouter_max_chars: int = 60_000
    ollama_base_url: str = ""  # e.g. http://localhost:11434 (leave empty to disable)
    ollama_model: str = "llama3.1:8b"
    ollama_max_chars: int = 24_000
    fallback_timeout_seconds: float = Field(default=150.0, gt=0)

    # Input limits
    max_content_chars: int = Field(default=100_000, ge=1_000)
    min_content_words: int = Field(default=50, ge=1)
    max_request_bytes: int = Field(default=1_500_000, ge=10_000)

    # Server
    max_concurrent_analyses: int = Field(default=4, ge=1)
    # Comma-separated Chrome extension IDs allowed to call the API. Empty = any extension origin.
    allowed_extension_ids: str = ""
    log_level: str = "INFO"

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key.strip())

    @property
    def extension_ids(self) -> list[str]:
        return [part.strip() for part in self.allowed_extension_ids.split(",") if part.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
