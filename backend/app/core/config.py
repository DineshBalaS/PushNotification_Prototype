from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "push_notification_prototype"
    frontend_url: str = "http://localhost:3000"
    firebase_credentials_path: str = ""
    novu_secret_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

@lru_cache
def get_settings() -> Settings:
    """
    Returns a cached instance of the settings per project criteria.
    """
    return Settings()

settings = get_settings()
