from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "VaultWatch Backend API"
    VERSION: str = "3.0.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # MongoDB
    MONGO_URI: str = "mongodb://localhost:27017"  # local MongoDB, a compose service, or an Atlas mongodb+srv:// URI
    MONGO_DB_NAME: str = "vaultwatch"

    # Security. SECRET_KEY signs CSRF tokens. Required outside development; in development a random
    # key is generated at startup when it is empty. JWT_* are kept for compatibility and unused by sessions.
    SECRET_KEY: str = ""
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Web app / sessions
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = "http://localhost:5173"  # comma-separated, never "*" with cookies
    SESSION_TTL_HOURS: int = 12
    SESSION_REMEMBER_DAYS: int = 30
    COOKIE_SECURE: bool = True  # browsers accept Secure cookies on http://localhost
    COOKIE_SAMESITE: str = "lax"  # serve the API on the same site as the frontend (or proxy /api)
    COOKIE_DOMAIN: str = ""
    TRUST_PROXY_HEADERS: bool = False  # only behind a proxy you control that sets X-Forwarded-For

    # Database migrations (app.migrations) run at startup unless disabled; run them yourself with
    # `python -m app.migrations upgrade` when several API instances start at once.
    RUN_MIGRATIONS_ON_STARTUP: bool = True

    # ML: the model bundle is loaded once at startup. Empty = app/ml/artifacts/model_bundle.json.gz
    ML_MODEL_PATH: str = ""

    # Hours of synthetic history created for the sample environment (needs at least 5 for the model's 4-hour minimum).
    DEMO_SEED_HOURS: int = 28

    # Notification channels (optional). Without them, alerts are recorded with status "not_configured".
    SLACK_WEBHOOK_URL: str = ""
    PAGERDUTY_ROUTING_KEY: str = ""

    # Email: "console" logs messages (and keeps them in a dev mailbox in development); "smtp" sends them
    EMAIL_BACKEND: str = "console"
    EMAIL_FROM: str = "VaultWatch <no-reply@example.com>"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = True
    CONTACT_INBOX: str = ""

    # Optional providers (leave empty until configured)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    BILLING_PROVIDER: str = ""  # e.g. "stripe" once configured

    @property
    def secret_key(self) -> str:
        return self.SECRET_KEY or self.JWT_SECRET

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip() and o.strip() != "*"]

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.lower() in ("development", "dev", "local", "test")

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
