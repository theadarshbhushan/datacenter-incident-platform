# VaultWatch Backend API

Production-grade FastAPI backend for the VaultWatch Data Center Incident Prediction Platform.

## Tech Stack
- **FastAPI 0.111.0**: High-performance asynchronous REST & WebSocket framework
- **Beanie 1.25.0**: Asynchronous ODM for MongoDB built on Motor & Pydantic
- **Motor 3.3.2**: Async Python driver for MongoDB
- **Celery 5.3.6 + Redis**: Distributed task queue & message broker
- **kafka-python-ng**: High-throughput distributed telemetry ingest consumer
- **python-jose & passlib[bcrypt]**: JWT authentication & password encryption
- **Prometheus**: Real-time FastAPI instrumentation (`/metrics`)
- **Loguru**: Structured enterprise logging

## Quick Start

```bash
cd dc-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## API Documentation & Endpoints

- Interactive Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Alternative ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)
- Prometheus Metrics: [http://localhost:8000/metrics](http://localhost:8000/metrics)
- Real-Time WebSocket Telemetry: `ws://localhost:8000/ws`

## Environment Configuration

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MONGO_URI` | MongoDB Connection URI | `mongodb://dcadmin:changeme_mongo_password@localhost:27017/vaultwatch?authSource=admin` |
| `MONGO_DB_NAME` | MongoDB database name | `vaultwatch` |
| `REDIS_URL` | Redis broker URL | `redis://localhost:6379/0` |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka brokers | `localhost:9092` |
| `ML_SERVICE_URL` | PyTorch/XGBoost ML Service | `http://localhost:8001` |
| `JWT_SECRET` | HMAC Secret for JWT tokens | *Secret Key* |

## Running Celery Worker & Kafka Ingest

```bash
celery -A app.workers.consumer.celery_app worker --loglevel=info
python -m app.workers.consumer
```
