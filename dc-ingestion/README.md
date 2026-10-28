# VaultWatch telemetry agent

`agent.py` sends readings to the backend's `POST /api/v1/telemetry/ingest` with an organization API key.
It replaced the earlier Kafka producer (the Kafka/Celery pipeline it fed was not organization-scoped and has been removed).

```bash
cd dc-ingestion
pip install -r requirements.txt
export VAULTWATCH_URL=http://localhost:8000          # Windows PowerShell: $env:VAULTWATCH_URL = "..."
export VAULTWATCH_API_KEY=vw_live_...                 # VaultWatch -> Integrations -> Create key (scope metrics:write)

python agent.py                       # real metrics of this machine (CPU, memory, disk, network, temperature if exposed)
python agent.py --rack A01 --datacenter "Mumbai-1"
python agent.py --simulate 6 --backfill-hours 6 --spike-after-min 10   # simulated fleet, for testing only
```

- Real mode only sends what the operating system exposes. Missing metrics are left out, never invented.
- Simulated servers are stored like real ones (the backend cannot tell them apart). Use a separate test organization.
- The model needs 4 hours of history per server before it scores it; `--backfill-hours` gives simulated servers that history immediately.
- `docker compose --profile agent up` runs the simulated fleet in a container. A container would report itself rather than the host, so run `agent.py` directly on the machines you want to monitor.
