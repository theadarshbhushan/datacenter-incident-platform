# VaultWatch Ingestion Service

Kafka producer simulating 10 real data center servers with realistic metric patterns.

## Quick Start
```bash
cd dc-ingestion
pip install -r requirements.txt
python producer.py
```

## Servers Simulated
10 servers across DC-East and DC-West:
- **Compute**: compute-01, compute-02, app-gateway-01, app-gateway-02
- **Storage**: cache-redis-01, storage-nas-01
- **Network**: kafka-broker-01, kafka-broker-02, edge-proxy-01
- **GPU**: ml-inference-01

## Anomaly Injection
Random anomalies injected every 80-200 ticks:
- `cpu_spike`
- `memory_leak`
- `disk_failure`
- `network_anomaly`
- `thermal_event`

## Configuration
Controlled via `.env`:
- `KAFKA_BOOTSTRAP_SERVERS`: Kafka broker addresses (default: `localhost:9092` locally, `kafka:29092` in container)
- `KAFKA_METRICS_TOPIC`: Kafka target topic (default: `server-metrics`)
- `SEND_INTERVAL_SECONDS`: Ingestion cadence in seconds (default: `5`)
