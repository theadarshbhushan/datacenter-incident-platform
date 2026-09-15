import os
import sys
import time
import json
import socket
from datetime import datetime, timezone
import numpy as np
from dotenv import load_dotenv
from loguru import logger
from kafka import KafkaProducer

load_dotenv()


def is_host_resolvable(hostname: str) -> bool:
    try:
        socket.gethostbyname(hostname)
        return True
    except Exception:
        return False


def get_bootstrap_servers() -> str:
    servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:29092")
    if "kafka:29092" in servers and not is_host_resolvable("kafka"):
        servers = servers.replace("kafka:29092", "localhost:9092")
    return servers


KAFKA_BOOTSTRAP_SERVERS = get_bootstrap_servers()
TOPIC = os.getenv("KAFKA_METRICS_TOPIC", "server-metrics")

SERVERS = [
    {"server_id": "server-01", "hostname": "compute-01", "type": "compute", "datacenter": "DC-East", "rack": "Rack-A"},
    {"server_id": "server-02", "hostname": "compute-02", "type": "compute", "datacenter": "DC-East", "rack": "Rack-A"},
    {"server_id": "server-03", "hostname": "app-gateway-01", "type": "compute", "datacenter": "DC-East", "rack": "Rack-B"},
    {"server_id": "server-04", "hostname": "app-gateway-02", "type": "compute", "datacenter": "DC-East", "rack": "Rack-B"},
    {"server_id": "server-05", "hostname": "cache-redis-01", "type": "storage", "datacenter": "DC-East", "rack": "Rack-B"},
    {"server_id": "server-06", "hostname": "kafka-broker-01", "type": "network", "datacenter": "DC-West", "rack": "Rack-C"},
    {"server_id": "server-07", "hostname": "kafka-broker-02", "type": "network", "datacenter": "DC-West", "rack": "Rack-C"},
    {"server_id": "server-08", "hostname": "ml-inference-01", "type": "gpu", "datacenter": "DC-West", "rack": "Rack-C"},
    {"server_id": "server-09", "hostname": "edge-proxy-01", "type": "network", "datacenter": "DC-West", "rack": "Rack-A"},
    {"server_id": "server-10", "hostname": "storage-nas-01", "type": "storage", "datacenter": "DC-West", "rack": "Rack-B"},
]


class ServerSimulator:
    def __init__(self, server: dict):
        self.server = server
        self.rng = np.random.default_rng(
            hash(server["server_id"]) % (2**31)
        )

        # Realistic baseline per server type
        baselines = {
            "compute": {"cpu": 35, "ram": 55},
            "storage": {"cpu": 20, "ram": 70},
            "network": {"cpu": 45, "ram": 40},
            "gpu":     {"cpu": 60, "ram": 75},
        }
        b = baselines[server["type"]]
        self.cpu_base = b["cpu"]
        self.ram_base = b["ram"]
        self.disk_used = self.rng.uniform(40, 70)
        self.tick = 0

        # Anomaly injection schedule
        self.anomaly_countdown = int(
            self.rng.integers(80, 200)
        )
        self.anomaly_duration = 0
        self.anomaly_type = None

    def next(self) -> dict:
        self.tick += 1
        self.anomaly_countdown -= 1

        # Start new anomaly
        if self.anomaly_countdown <= 0 and self.anomaly_duration <= 0:
            self.anomaly_type = self.rng.choice([
                "cpu_spike", "memory_leak",
                "disk_failure", "network_anomaly",
                "thermal_event", None, None, None
            ])
            if self.anomaly_type:
                self.anomaly_duration = int(
                    self.rng.integers(3, 12)
                )
            self.anomaly_countdown = int(
                self.rng.integers(80, 200)
            )

        inject = self.anomaly_duration > 0
        if inject:
            self.anomaly_duration -= 1

        # CPU with realistic oscillation
        cpu = (self.cpu_base +
               15 * np.sin(self.tick / 20) +
               self.rng.normal(0, 3))

        # RAM slowly increases (memory pressure)
        self.ram_base = min(
            self.ram_base + self.rng.uniform(0, 0.02),
            92
        )
        ram = self.ram_base + self.rng.normal(0, 2)

        # Disk I/O baseline
        disk_io = float(self.rng.exponential(25))

        # Network baseline
        net = float(self.rng.exponential(60))

        # Inject anomaly patterns
        if inject:
            if self.anomaly_type == "cpu_spike":
                cpu = float(self.rng.uniform(88, 98))
            elif self.anomaly_type == "memory_leak":
                ram = float(self.rng.uniform(89, 96))
            elif self.anomaly_type == "disk_failure":
                disk_io = float(self.rng.uniform(400, 900))
            elif self.anomaly_type == "network_anomaly":
                net = float(self.rng.uniform(800, 1500))
            elif self.anomaly_type == "thermal_event":
                cpu = float(self.rng.uniform(75, 90))

        # Temperature correlated with CPU
        temp = (30 + cpu * 0.5 +
                self.rng.normal(0, 2))
        if inject and self.anomaly_type == "thermal_event":
            temp += self.rng.uniform(15, 25)

        # Disk usage slowly increases
        self.disk_used = min(
            self.disk_used + self.rng.uniform(0, 0.005),
            95
        )

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "server_id": self.server["server_id"],
            "hostname": self.server["hostname"],
            "hardware_type": self.server["type"],
            "datacenter": self.server["datacenter"],
            "rack": self.server["rack"],
            "cpu_pct": round(float(np.clip(cpu, 0, 100)), 2),
            "ram_pct": round(float(np.clip(ram, 0, 100)), 2),
            "disk_io_mbps": round(float(np.clip(disk_io, 0, 1000)), 2),
            "net_mbps": round(float(np.clip(net, 0, 2000)), 2),
            "temp_celsius": round(float(np.clip(temp, 20, 100)), 2),
            "disk_used_pct": round(float(self.disk_used), 2),
            "is_anomaly_injected": inject,
            "anomaly_type": self.anomaly_type if inject else None,
        }


def create_producer():
    retries = 15
    servers = get_bootstrap_servers()
    for i in range(retries):
        try:
            producer = KafkaProducer(
                bootstrap_servers=servers.split(","),
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8"),
                acks="all",
                retries=3,
            )
            logger.info(f"Connected to Kafka at {servers}")
            return producer
        except Exception as e:
            logger.warning(f"Kafka not ready ({i+1}/{retries}): {e}")
            time.sleep(5)
    raise RuntimeError("Cannot connect to Kafka")


def main():
    logger.info("Starting VaultWatch ingestion producer")
    simulators = [ServerSimulator(s) for s in SERVERS]
    producer = create_producer()
    interval = int(os.getenv("SEND_INTERVAL_SECONDS", 5))

    logger.info(f"Publishing metrics for {len(simulators)} servers every {interval}s")

    while True:
        batch_start = time.time()
        anomalies = []

        for sim in simulators:
            metric = sim.next()
            producer.send(
                TOPIC,
                key=metric["server_id"],
                value=metric,
            )
            if metric["is_anomaly_injected"]:
                anomalies.append(f"{metric['server_id']}:{metric['anomaly_type']}")

        producer.flush()

        if anomalies:
            logger.warning(f"ANOMALIES injected: {', '.join(anomalies)}")
        else:
            logger.info(f"Published {len(simulators)} metrics")

        # Precise interval timing
        elapsed = time.time() - batch_start
        sleep_time = max(0, interval - elapsed)
        time.sleep(sleep_time)


if __name__ == "__main__":
    main()
