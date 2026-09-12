from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # MongoDB Configuration
    MONGO_URI: str = "mongodb://dcadmin:changeme_mongo_password@mongodb:27017/datacenter_incidents?authSource=admin"
    MONGO_DB_NAME: str = "datacenter_incidents"

    # Redis Configuration
    REDIS_URL: str = "redis://redis:6379/0"

    # Kafka Configuration
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:29092"
    KAFKA_METRICS_TOPIC: str = "server-metrics"

    # JWT Configuration
    JWT_SECRET: str = "changeme_use_a_long_random_secret_key_here"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ML Service
    ML_SERVICE_URL: str = "http://ml-service:8001"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

_settings = None

def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
