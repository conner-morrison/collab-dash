"""Application configuration.

Values are read from the environment (or a .env file) so the same code runs
in local development (SQLite) and production (PostgreSQL + Redis).
"""
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Core ---
    app_name: str = "Collaborative Project Dashboard"
    environment: str = "development"

    # --- Database ---
    # Defaults to a local SQLite file so the project runs with zero setup.
    # In production set DATABASE_URL to a PostgreSQL DSN.
    database_url: str = "sqlite:///./dashboard.db"

    # --- Auth / JWT ---
    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # --- CORS ---
    # One or more allowed browser origins, comma-separated. Each must be an exact
    # origin (scheme + host, no trailing slash / path), e.g.
    #   FRONTEND_ORIGIN=https://lanceflow.co,https://www.lanceflow.co,http://localhost:3000
    frontend_origin: str = "http://localhost:3000"

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origin.split(",") if o.strip()]

    # --- Admin ---
    # An admin user is auto-provisioned on startup when ADMIN_PASSWORD is set.
    # Keep the password OUT of source control — set it via the environment.
    admin_email: str = "admin@collabdash.com"
    admin_password: str = ""  # empty => no admin auto-provisioned

    # --- Realtime ---
    # "memory" uses an in-process broadcaster (single instance / dev).
    # "redis" would use Redis Pub/Sub for multi-instance fan-out.
    broadcaster: str = "memory"
    redis_url: str = "redis://localhost:6379/0"

    # --- Email (SendGrid) ---
    # When sendgrid_api_key + email_from are set, verification/reset emails are
    # sent for real. Otherwise the app falls back to logging the link (dev).
    sendgrid_api_key: str = ""
    email_from: str = ""  # a SendGrid-verified sender address
    email_from_name: str = "Collab Dashboard"

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # Managed providers (Heroku, some Railway/Render URLs) emit the legacy
        # "postgres://" scheme, which SQLAlchemy 2.0 no longer accepts.
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
