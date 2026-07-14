import os
import time
import json
import random
from datetime import datetime, timezone
from loguru import logger
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:29092")
KAFKA_METRICS_TOPIC = os.getenv("KAFKA_METRICS_TOPIC", "server-metrics")
SEND_INTERVAL_SECS = 5

class MetricSimulator:
    def __init__(self, hostname: str):
        self.hostname = hostname
        # State tracking for leaks/spikes
        self.ram_usage = random.uniform(25.0, 45.0)
        self.cpu_spike_ticks = 0
        self.net_spike_ticks = 0
        self.disk_burst_ticks = 0
        self.disk_used_pct = random.uniform(20.0, 60.0)

    def generate_next_metrics(self) -> dict:
        # 1. CPU Simulation (normal 20-60%, occasional spikes to 95%)
        is_spiking = self.cpu_spike_ticks > 0
        if not is_spiking and random.random() < 0.03:  # 3% chance to start a CPU spike
            self.cpu_spike_ticks = random.randint(4, 10)  # lasts 20-50 seconds
            
        if self.cpu_spike_ticks > 0:
            cpu_pct = random.uniform(85.0, 98.0)
            self.cpu_spike_ticks -= 1
        else:
            cpu_pct = random.uniform(20.0, 60.0)

        # 2. RAM Simulation (slow gradual increase over time - memory leak simulation)
        # RAM leaks by 0.05% to 0.15% per tick (every 5 seconds)
        self.ram_usage += random.uniform(0.05, 0.15)
        # If RAM usage goes too high, simulate a reboot/service cleanup
        if self.ram_usage > 95.0:
            self.ram_usage = random.uniform(25.0, 40.0)
        elif self.ram_usage > 85.0 and random.random() < 0.05:
            self.ram_usage = random.uniform(25.0, 40.0)
            
        # 3. Disk I/O Simulation (random with periodic bursts)
        if self.disk_burst_ticks == 0 and random.random() < 0.05:
            self.disk_burst_ticks = random.randint(3, 8)
            
        if self.disk_burst_ticks > 0:
            disk_io_mbps = random.uniform(300.0, 500.0)
            self.disk_burst_ticks -= 1
        else:
            disk_io_mbps = random.uniform(5.0, 40.0)

        # Disk space climbs very slowly (0.001% to 0.005% per step)
        self.disk_used_pct = min(100.0, self.disk_used_pct + random.uniform(0.001, 0.005))

        # 4. Temperature (correlated with CPU: temp = 30 + cpu*0.5 + noise)
        temp_celsius = 30.0 + cpu_pct * 0.5 + random.uniform(-2.0, 2.0)

        # 5. Network Simulation (traffic with occasional anomaly spikes)
        if self.net_spike_ticks == 0 and random.random() < 0.02:
            self.net_spike_ticks = random.randint(3, 7)
            
        if self.net_spike_ticks > 0:
            net_mbps = random.uniform(800.0, 1500.0)
            self.net_spike_ticks -= 1
        else:
            net_mbps = random.uniform(50.0, 250.0)

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "server_id": self.hostname,
            "cpu_pct": round(cpu_pct, 2),
            "ram_pct": round(self.ram_usage, 2),
            "disk_io_mbps": round(disk_io_mbps, 2),
            "net_mbps": round(net_mbps, 2),
            "temp_celsius": round(temp_celsius, 2),
            "disk_used_pct": round(self.disk_used_pct, 2)
        }

def get_kafka_producer(servers: str, retries: int = 15) -> KafkaProducer:
    for attempt in range(retries):
        try:
            logger.info(f"Connecting to Kafka bootstrap servers: {servers} (Attempt {attempt+1}/{retries})...")
            producer = KafkaProducer(
                bootstrap_servers=servers.split(","),
                value_serializer=lambda v: json.dumps(v).encode("utf-8")
            )
            logger.info("Successfully connected to Kafka.")
            return producer
        except NoBrokersAvailable:
            logger.warning("Kafka brokers not available yet. Waiting 5 seconds before retrying...")
            time.sleep(5)
    raise RuntimeError("Failed to connect to Kafka after multiple retries.")

def main():
    logger.info("Initializing Data Center Metric Ingestion Producer...")
    
    # Setup 10 Simulated Servers
    simulators = [MetricSimulator(hostname=f"server-{i:02d}") for i in range(1, 11)]
    
    producer = get_kafka_producer(KAFKA_BOOTSTRAP_SERVERS)
    
    logger.info(f"Starting metric generation loop. Publishing to topic '{KAFKA_METRICS_TOPIC}' every {SEND_INTERVAL_SECS} seconds.")
    try:
        while True:
            start_time = time.time()
            for sim in simulators:
                metric_data = sim.generate_next_metrics()
                producer.send(KAFKA_METRICS_TOPIC, value=metric_data)
                logger.debug(f"Published telemetry: {metric_data}")
            
            producer.flush()
            
            # Control timing loop
            elapsed = time.time() - start_time
            sleep_time = max(0.1, SEND_INTERVAL_SECS - elapsed)
            time.sleep(sleep_time)
            
    except KeyboardInterrupt:
        logger.info("Producer stopped by user.")
    except Exception as e:
        logger.critical(f"Producer encountered a critical error: {e}")
    finally:
        producer.close()
        logger.info("Kafka producer connection closed.")

if __name__ == "__main__":
    main()
