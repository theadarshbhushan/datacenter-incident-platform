import socket
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


def is_host_resolvable(hostname: str) -> bool:
    try:
        socket.gethostbyname(hostname)
        return True
    except Exception:
        return False


class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "VaultWatch Backend API"
    VERSION: str = "2.4.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # MongoDB
    MONGO_URI: str = "mongodb://dcadmin:changeme_mongo_password@mongodb:27017/vaultwatch?authSource=admin"
    MONGO_DB_NAME: str = "vaultwatch"

    # Redis / Celery
    REDIS_URL: str = "redis://redis:6379/0"

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:29092"
    KAFKA_METRICS_TOPIC: str = "server-metrics"

    # Security. SECRET_KEY signs CSRF tokens. Required outside development; in development a random
    # key is generated at startup when it is empty. JWT_* are kept for compatibility and unused by sessions.
    SECRET_KEY: str = ""
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ML Service
    ML_SERVICE_URL: str = "http://ml-service:8001"

    # Web app / sessions
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = "http://localhost:5173"  # comma-separated, never "*" with cookies
    SESSION_TTL_HOURS: int = 12
    SESSION_REMEMBER_DAYS: int = 30
    COOKIE_SECURE: bool = True  # browsers accept Secure cookies on http://localhost
    COOKIE_SAMESITE: str = "lax"  # serve the API on the same site as the frontend (or proxy /api)
    COOKIE_DOMAIN: str = ""
    TRUST_PROXY_HEADERS: bool = False  # only behind a proxy you control that sets X-Forwarded-For

    # Service-to-service token for the internal telemetry API (legacy /servers, /incidents, ... routes
    # and the /ws stream). Empty disables those routes. Never expose it to browsers.
    INTERNAL_API_TOKEN: str = ""

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

    @property
    def get_mongo_uri(self) -> str:
        uri = self.MONGO_URI
        if "@mongodb:" in uri and not is_host_resolvable("mongodb"):
            uri = uri.replace("@mongodb:", "@localhost:")
        return uri

    @property
    def get_redis_url(self) -> str:
        url = self.REDIS_URL
        if "//redis:" in url and not is_host_resolvable("redis"):
            url = url.replace("//redis:", "//localhost:")
        return url

    @property
    def get_ml_service_url(self) -> str:
        url = self.ML_SERVICE_URL
        if "//ml-service:" in url and not is_host_resolvable("ml-service"):
            url = url.replace("//ml-service:", "//localhost:")
        return url


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
