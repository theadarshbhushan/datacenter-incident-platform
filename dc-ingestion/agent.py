"""
VaultWatch telemetry agent.

Sends readings to POST /api/v1/telemetry/ingest with an organization API key (scope metrics:write).

    pip install -r requirements.txt
    export VAULTWATCH_URL=http://localhost:8000       # or https://your-vaultwatch-host
    export VAULTWATCH_API_KEY=vw_live_...              # Integrations -> Create key
    python agent.py                                    # report THIS machine's real metrics every 15 s
    python agent.py --simulate 6                       # report 6 SIMULATED servers (for testing only)

Real mode uses psutil: CPU %, memory %, disk space %, disk throughput (MB/s), network throughput
(Mb/s) and, where the OS exposes it, CPU temperature. Nothing is invented: a metric the machine does
not expose is simply not sent.

Simulated mode is for trying the pipeline without hardware. Those servers are real rows in your
organization (the backend cannot tell them apart), so use a separate test organization for it.
Use --backfill-hours to send history first, so the model (which needs 4 hours of history) starts
scoring right away.
"""
from __future__ import annotations

import argparse
import math
import os
import random
import socket
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx

INTERVAL = float(os.getenv("SEND_INTERVAL_SECONDS", "15"))


def post(client: httpx.Client, points: list[dict]) -> None:
    for i in range(0, len(points), 500):
        r = client.post("/api/v1/telemetry/ingest", json={"points": points[i:i + 500]})
        if r.status_code >= 300:
            print(f"ingest failed: HTTP {r.status_code} {r.text[:300]}", file=sys.stderr)
            if r.status_code in (401, 403):
                sys.exit("Check VAULTWATCH_API_KEY (it needs the metrics:write scope).")
            continue
        body = r.json()["data"]
        if body["rejected"]:
            print(f"rejected {len(body['rejected'])}: {body['rejected'][0]['error']}", file=sys.stderr)


# ---------- real host metrics ----------

def real_loop(client: httpx.Client, server_id: str, rack: str | None, dc: str | None) -> None:
    import psutil

    host = socket.gethostname()
    psutil.cpu_percent(None)
    last_disk, last_net, last_t = psutil.disk_io_counters(), psutil.net_io_counters(), time.time()
    while True:
        time.sleep(INTERVAL)
        now = time.time()
        dt = max(1e-6, now - last_t)
        disk, net = psutil.disk_io_counters(), psutil.net_io_counters()
        metrics = {
            "cpu": psutil.cpu_percent(None),
            "memory": psutil.virtual_memory().percent,
            "storage": psutil.disk_usage(os.path.abspath(os.sep)).percent,
        }
        if disk and last_disk:
            metrics["diskIo"] = round(((disk.read_bytes - last_disk.read_bytes) + (disk.write_bytes - last_disk.write_bytes)) / dt / 1e6, 3)
        if net and last_net:
            metrics["network"] = round(((net.bytes_recv - last_net.bytes_recv) + (net.bytes_sent - last_net.bytes_sent)) * 8 / dt / 1e6, 3)
        temps = getattr(psutil, "sensors_temperatures", lambda: {})() or {}
        readings = [t.current for group in temps.values() for t in group if t.current]
        if readings:
            metrics["temperature"] = round(max(readings), 1)
        last_disk, last_net, last_t = disk, net, now
        post(client, [{"serverId": server_id, "hostname": host, "rack": rack, "dataCenter": dc, "role": "compute",
                       "timestamp": datetime.now(timezone.utc).isoformat(), "metrics": metrics}])
        print(f"sent {metrics}")


# ---------- simulated fleet ----------

def simulated_point(i: int, ts: datetime, incident: bool) -> dict:
    day = 2 * math.pi * (ts.hour * 60 + ts.minute) / 1440 + i
    cpu = 35 + 10 * math.sin(day) + random.gauss(0, 2.5)
    if incident:
        cpu = 95 + random.gauss(0, 2)
    temp = 32 + 0.22 * cpu + random.gauss(0, 0.6)
    return {
        "serverId": f"sim-{i:02d}", "hostname": f"sim-{i:02d}", "rack": f"SIM{1 + i // 4}", "dataCenter": "Simulated",
        "role": "simulated", "timestamp": ts.isoformat(),
        "metrics": {"cpu": round(min(100, max(0, cpu)), 2), "memory": round(55 + random.gauss(0, 1.5), 2), "temperature": round(temp, 2),
                    "power": round(260 + 4.2 * cpu + random.gauss(0, 8), 1), "network": round(max(1, 150 * (1 + 0.3 * math.sin(day)) + random.gauss(0, 8)), 1)},
    }


def simulate(client: httpx.Client, n: int, backfill_hours: float, spike_after_min: float | None) -> None:
    start = time.time()
    if backfill_hours:
        now = datetime.now(timezone.utc)
        steps = int(backfill_hours * 12)
        pts = [simulated_point(i, now - timedelta(minutes=5 * k), False) for k in range(steps, 0, -1) for i in range(n)]
        post(client, pts)
        print(f"backfilled {len(pts)} simulated points ({backfill_hours} h)")
    while True:
        spiking = spike_after_min is not None and time.time() - start > spike_after_min * 60
        post(client, [simulated_point(i, datetime.now(timezone.utc), spiking and i == 0) for i in range(n)])
        print(f"sent {n} simulated points{' (sim-00 spiking)' if spiking else ''}")
        time.sleep(INTERVAL)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--server-id", default=os.getenv("VAULTWATCH_SERVER_ID") or socket.gethostname().lower().replace(" ", "-")[:64])
    ap.add_argument("--rack", default=os.getenv("VAULTWATCH_RACK"))
    ap.add_argument("--datacenter", default=os.getenv("VAULTWATCH_DATACENTER"))
    ap.add_argument("--simulate", type=int, metavar="N", help="send N simulated servers instead of this machine's metrics")
    ap.add_argument("--backfill-hours", type=float, default=float(os.getenv("BACKFILL_HOURS", "0")), help="simulated mode: send this much history first (max 24)")
    ap.add_argument("--spike-after-min", type=float, default=None, help="simulated mode: make sim-00 run hot after this many minutes")
    args = ap.parse_args()
    url, key = os.getenv("VAULTWATCH_URL", "http://localhost:8000").rstrip("/"), os.getenv("VAULTWATCH_API_KEY", "")
    if not key:
        sys.exit("Set VAULTWATCH_API_KEY (create one in VaultWatch: Integrations -> Create key).")
    with httpx.Client(base_url=url, headers={"X-API-Key": key}, timeout=20) as client:
        if args.simulate:
            simulate(client, args.simulate, min(24.0, args.backfill_hours), args.spike_after_min)
        else:
            real_loop(client, args.server_id, args.rack, args.datacenter)


if __name__ == "__main__":
    main()
