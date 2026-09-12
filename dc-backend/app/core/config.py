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

    # Security / JWT
    JWT_SECRET: str = "your-super-secret-key-here-vaultwatch-2024-jwt"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ML Service
    ML_SERVICE_URL: str = "http://ml-service:8001"

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
