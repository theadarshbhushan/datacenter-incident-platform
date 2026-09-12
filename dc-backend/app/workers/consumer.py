import os
import json
import uuid
import time
from datetime import datetime
from celery import Celery
from pymongo import MongoClient
import httpx
from loguru import logger
from app.core.config import settings

REDIS_URL = settings.get_redis_url
MONGO_URI = settings.get_mongo_uri
MONGO_DB_NAME = settings.MONGO_DB_NAME
ML_SERVICE_URL = settings.get_ml_service_url
KAFKA_BOOTSTRAP_SERVERS = settings.KAFKA_BOOTSTRAP_SERVERS
KAFKA_METRICS_TOPIC = settings.KAFKA_METRICS_TOPIC

celery_app = Celery("vaultwatch_worker", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
)


def get_mongo_db():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return client[MONGO_DB_NAME]


@celery_app.task(name="process_metric")
def process_metric(metric_data: dict):
    """
    Processes incoming Kafka metric:
    1. Saves metric to MongoDB
    2. POST to ML service /anomaly/detect
    3. If is_anomaly:
       - Creates incident in MongoDB
       - Creates alert in MongoDB
    4. Updates server status based on severity
    """
    server_id = metric_data.get("server_id", "unknown")
    now = datetime.utcnow()

    try:
        db = get_mongo_db()

        # 1. Save metric to MongoDB
        metric_doc = {
            "server_id": server_id,
            "cpu_pct": float(metric_data.get("cpu_pct", 0.0)),
            "ram_pct": float(metric_data.get("ram_pct", 0.0)),
            "disk_io_mbps": float(metric_data.get("disk_io_mbps", 0.0)),
            "net_mbps": float(metric_data.get("net_mbps", 0.0)),
            "temp_celsius": float(metric_data.get("temp_celsius", 0.0)),
            "disk_used_pct": float(metric_data.get("disk_used_pct", 0.0)),
            "timestamp": now,
        }
        db.metrics.insert_one(metric_doc)

        # 2. POST to ML service /anomaly/detect
        is_anomaly = False
        anomaly_score = 0.0
        incident_type = "nominal"
        shap_explanation = None

        try:
            with httpx.Client(timeout=4.0) as client:
                res = client.post(f"{ML_SERVICE_URL}/anomaly/detect", json=metric_data)
                if res.status_code == 200:
                    ml_data = res.json()
                    is_anomaly = ml_data.get("is_anomaly", False)
                    anomaly_score = ml_data.get("anomaly_score", 0.0)
                    incident_type = ml_data.get("incident_type", "cpu_spike")
                    shap_explanation = ml_data.get("shap_explanation")
        except Exception as e:
            logger.warning(f"ML anomaly service check skipped or failed: {e}")
            # Fallback threshold calculation
            cpu = metric_doc["cpu_pct"]
            temp = metric_doc["temp_celsius"]
            if cpu > 85.0 or temp > 80.0:
                is_anomaly = True
                anomaly_score = round(min(0.98, (cpu / 100.0) * 0.6 + (temp / 100.0) * 0.4), 3)
                incident_type = "cpu_spike"

        # 3. If is_anomaly: create incident & alert
        if is_anomaly:
            inc_id = f"INC-{uuid.uuid4().hex[:4].upper()}"
            severity = "critical" if anomaly_score > 0.85 else "high"

            incident_doc = {
                "incident_id": inc_id,
                "server_id": server_id,
                "hostname": metric_data.get("hostname", server_id),
                "detected_at": now,
                "resolved_at": None,
                "severity": severity,
                "incident_type": incident_type,
                "anomaly_score": anomaly_score,
                "model_used": "XGBoost + TreeExplainer",
                "shap_explanation": shap_explanation,
                "acknowledged": False,
                "status": "open",
                "notes": f"Automated anomaly detected: {incident_type} (score {anomaly_score})",
                "created_at": now,
            }
            db.incidents.insert_one(incident_doc)

            alert_doc = {
                "server_id": server_id,
                "incident_id": inc_id,
                "severity": severity,
                "message": f"Outage risk detected on {server_id}: {incident_type} (Score {anomaly_score})",
                "anomaly_score": anomaly_score,
                "recommendation": "Workload balancing & thermal throttle recommended.",
                "acknowledged": False,
                "created_at": now,
            }
            db.alerts.insert_one(alert_doc)

            # 4. Update server status
            db.servers.update_one(
                {"server_id": server_id},
                {"$set": {"status": severity}},
            )
            logger.warning(f"🚨 Incident {inc_id} logged on {server_id} [{severity}]")

        return {"status": "success", "server_id": server_id, "is_anomaly": is_anomaly}

    except Exception as err:
        logger.error(f"Error in process_metric task: {err}")
        return {"status": "error", "error": str(err)}


def start_consumer():
    """Kafka consumer loop that reads from server-metrics topic"""
    try:
        from kafka import KafkaConsumer
    except ImportError:
        logger.error("kafka-python-ng is not installed")
        return

    logger.info(f"Connecting Kafka Consumer to {KAFKA_BOOTSTRAP_SERVERS} [Topic: {KAFKA_METRICS_TOPIC}]...")

    while True:
        try:
            consumer = KafkaConsumer(
                KAFKA_METRICS_TOPIC,
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS.split(","),
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                auto_offset_reset="latest",
                group_id="vaultwatch-metric-processors",
            )
            logger.info("Kafka consumer loop active.")
            for message in consumer:
                metric_data = message.value
                process_metric.delay(metric_data)
        except Exception as e:
            logger.error(f"Kafka consumer connection error: {e}. Retrying in 5 seconds...")
            time.sleep(5)


if __name__ == "__main__":
    start_consumer()
