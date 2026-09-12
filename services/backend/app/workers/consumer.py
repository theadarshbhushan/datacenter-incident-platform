import os
import json
import time
import asyncio
import threading
from datetime import datetime, timezone

from celery import Celery
from celery.signals import worker_ready
import httpx
from loguru import logger
from motor.motor_asyncio import AsyncIOMotorClient
from kafka import KafkaConsumer

# ── Environment Configuration ────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://dcadmin:changeme_mongo_password@mongodb:27017/datacenter_incidents?authSource=admin",
)
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "datacenter_incidents")
ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://ml-service:8001")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:29092")
KAFKA_METRICS_TOPIC = os.getenv("KAFKA_METRICS_TOPIC", "server-metrics")

# ── Celery App Instance ──────────────────────────────────────────────────────
celery_app = Celery('dc_platform')
celery_app.config_from_object({
    'broker_url': os.getenv('REDIS_URL', 'redis://redis:6379/0'),
    'result_backend': os.getenv('REDIS_URL', 'redis://redis:6379/0'),
})

# Alias for standard Celery CLI discovery
app = celery_app


# ── MongoDB & ML Processing Helper ──────────────────────────────────────────
async def _async_process_metric(metric: dict):
    client = AsyncIOMotorClient(MONGO_URI)
    try:
        db = client[MONGO_DB_NAME]

        # 1. Save metric to MongoDB
        metric_doc = dict(metric)
        ts = metric_doc.get("timestamp")
        if isinstance(ts, str):
            try:
                metric_doc["timestamp"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except Exception:
                metric_doc["timestamp"] = datetime.now(timezone.utc)
        elif not isinstance(ts, datetime):
            metric_doc["timestamp"] = datetime.now(timezone.utc)

        await db.metrics.insert_one(metric_doc)
        logger.debug(f"Saved metric to MongoDB for server '{metric.get('server_id')}'")

        # 2. Call ML service via httpx POST to http://ml-service:8001/anomaly/detect
        detect_url = f"{ML_SERVICE_URL}/anomaly/detect"
        server_id = str(metric.get("server_id", "unknown"))

        payload = {
            "server_id": server_id,
            "metrics": [
                {
                    "cpu_pct": float(metric.get("cpu_pct", 0.0)),
                    "ram_pct": float(metric.get("ram_pct", 0.0)),
                    "disk_io_mbps": float(metric.get("disk_io_mbps", 0.0)),
                    "net_mbps": float(metric.get("net_mbps", 0.0)),
                    "temp_celsius": float(metric.get("temp_celsius", 0.0)),
                    "disk_used_pct": float(metric.get("disk_used_pct", 0.0)),
                    "timestamp": ts if isinstance(ts, str) else datetime.now(timezone.utc).isoformat(),
                }
            ],
        }

        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.post(detect_url, json=payload)
            if resp.status_code == 200:
                resp_json = resp.json()
                anomaly_data = resp_json.get("data", resp_json)
                is_anomaly = bool(anomaly_data.get("is_anomaly", False))
                anomaly_score = float(anomaly_data.get("anomaly_score", 0.0))

                # 3. If is_anomaly is True, create incident in MongoDB incidents collection
                if is_anomaly:
                    severity = "medium"
                    if anomaly_score > 0.8:
                        severity = "critical"
                    elif anomaly_score > 0.6:
                        severity = "high"

                    incident_doc = {
                        "server_id": server_id,
                        "detected_at": datetime.now(timezone.utc),
                        "resolved_at": None,
                        "severity": severity,
                        "incident_type": anomaly_data.get("incident_type", "predicted_outage"),
                        "anomaly_score": anomaly_score,
                        "model_used": "isolation_forest",
                        "acknowledged": False,
                        "notes": f"Auto-detected anomaly via Celery consumer. Anomaly score: {anomaly_score:.4f}",
                    }
                    result = await db.incidents.insert_one(incident_doc)
                    logger.warning(
                        f"Anomaly detected! Created incident {result.inserted_id} for server '{server_id}' "
                        f"(severity={severity}, score={anomaly_score:.4f})"
                    )
            else:
                logger.warning(
                    f"ML service /anomaly/detect returned status {resp.status_code}: {resp.text}"
                )
    except Exception as e:
        logger.error(f"Error processing metric for server '{metric.get('server_id')}': {e}")
        raise
    finally:
        client.close()


# ── Celery Task ──────────────────────────────────────────────────────────────
@celery_app.task(name="app.workers.consumer.process_metric")
def process_metric(metric: dict):
    """Celery task to process a metric received from Kafka."""
    if isinstance(metric, str):
        metric = json.loads(metric)
    asyncio.run(_async_process_metric(metric))


# ── Kafka Consumer Loop ──────────────────────────────────────────────────────
def start_consumer(topic: str = KAFKA_METRICS_TOPIC):
    """Kafka consumer loop that reads from topic and calls process_metric.delay()."""
    servers = KAFKA_BOOTSTRAP_SERVERS.split(",")
    logger.info(f"Starting Kafka consumer for topic '{topic}' on {servers}...")

    consumer = None
    for attempt in range(30):
        try:
            consumer = KafkaConsumer(
                topic,
                bootstrap_servers=servers,
                group_id="celery-metric-consumer-group",
                auto_offset_reset="latest",
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                enable_auto_commit=True,
            )
            logger.info(f"Connected to Kafka topic '{topic}' successfully.")
            break
        except Exception as e:
            logger.warning(f"Waiting for Kafka brokers (attempt {attempt + 1}/30): {e}")
            time.sleep(3)

    if consumer is None:
        logger.error("Failed to connect Kafka consumer after retries.")
        return

    try:
        for message in consumer:
            metric_data = message.value
            logger.debug(f"Received metric from Kafka: {metric_data}")
            process_metric.delay(metric_data)
    except Exception as e:
        logger.error(f"Error in Kafka consumer loop: {e}")
    finally:
        if consumer:
            consumer.close()


# ── Worker Lifecycle Hooks ───────────────────────────────────────────────────
@worker_ready.connect
def on_worker_ready(**kwargs):
    """Launch Kafka consumer background thread when Celery worker is ready."""
    logger.info("Celery worker ready. Launching Kafka consumer thread...")
    t = threading.Thread(target=start_consumer, daemon=True, name="kafka-consumer-thread")
    t.start()


if __name__ == "__main__":
    start_consumer()
