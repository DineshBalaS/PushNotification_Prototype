from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "push_notification_prototype"
    frontend_url: str = "http://localhost:3000"
    firebase_credentials_path: str = ""

    novu_secret_key: str = Field(
        min_length=1,
        description="Novu secret API key (server-side only). Maps to NOVU_SECRET_KEY.",
    )
    novu_server_url: Optional[str] = Field(
        default=None,
        description=(
            "Optional Novu API base URL for novu-py `server_url` (e.g. EU: "
            "https://eu.api.novu.co). Omit for US default."
        ),
    )
    novu_fcm_integration_identifier: Optional[str] = Field(
        default=None,
        description=(
            "Optional FCM integration identifier in Novu when multiple push "
            "integrations exist (Push channel / credentials APIs)."
        ),
    )
    persist_device_tokens_in_mongo: bool = Field(
        default=False,
        description=(
            "If true, PATCH /me/fcm-token also writes to the legacy "
            "`device_tokens` collection. Default false: Novu only."
        ),
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("novu_server_url", "novu_fcm_integration_identifier", mode="before")
    @classmethod
    def _empty_optional_str_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v


@lru_cache
def get_settings() -> Settings:
    """
    Returns a cached instance of the settings per project criteria.
    """
    return Settings()


settings = get_settings()
