"""
Sample workspace data, ported from dc-frontend/src/data/demo.ts so mock mode and the real backend
show the same, clearly labeled demo environment. Nothing here comes from a live model.
"""
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

HOUR = 3600_000
DAY = 24 * HOUR
M32 = 0xFFFFFFFF


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def iso_ms(ms: float) -> str:
    """Same format as JavaScript's Date.toISOString()."""
    dt = datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return iso_ms(dt.timestamp() * 1000)


def js_round(x: float) -> int:
    return math.floor(x + 0.5)


def num(x: float):
    """JSON numbers like JavaScript: 1.0 serializes as 1."""
    return int(x) if float(x).is_integer() else x


def mulberry32(seed: int):
    state = [seed & M32]

    def imul(a: int, b: int) -> int:
        return (a * b) & M32

    def rand() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & M32
        t = state[0]
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rand


DEMO_DATA_CENTERS = [
    {"id": "dc-east", "name": "DC1", "location": "Mumbai", "environment": "Production"},
    {"id": "dc-west", "name": "DC2", "location": "Bengaluru", "environment": "Production"},
]

_ROLES = ["Database", "App server", "Cache", "Kafka broker", "ML inference", "Storage", "Edge proxy", "Compute"]
_MODELS = ["Dell R760", "HPE DL380 Gen11", "Supermicro SYS-221H", "Lenovo SR650 V3"]
_HOTSPOTS: Dict[str, Dict[str, Any]] = {
    "srv-a02-3": {"cpu": 94, "memory": 88, "temperature": 82, "status": "critical", "connectivity": "degraded"},
    "srv-b01-2": {"cpu": 71, "memory": 92, "temperature": 63, "status": "warning"},
    "srv-a03-1": {"cpu": 64, "memory": 58, "temperature": 76, "status": "warning"},
    "srv-c02-4": {"cpu": 18, "memory": 22, "temperature": 41, "status": "offline", "connectivity": "offline"},
}


def worst_status(statuses: List[str]) -> str:
    if "critical" in statuses:
        return "critical"
    if "offline" in statuses or "warning" in statuses:
        return "warning"
    return "healthy"


def build_infrastructure() -> Tuple[List[dict], List[dict]]:
    rand = mulberry32(42)
    racks: List[dict] = []
    servers: List[dict] = []
    layout = {"dc-east": ["A01", "A02", "A03", "B01", "B02", "B03"], "dc-west": ["C01", "C02", "D01", "D02"]}
    for dc_id, labels in layout.items():
        for idx, label in enumerate(labels):
            rack_id = f"rack-{label.lower()}"
            rack_servers = []
            for slot in range(1, 5):
                sid = f"srv-{label.lower()}-{slot}"
                base = {
                    "id": sid,
                    "hostname": f"{'ash' if dc_id == 'dc-east' else 'hio'}-{label.lower()}-{slot:02d}",
                    "rackId": rack_id,
                    "dcId": dc_id,
                    "slot": slot,
                    "role": _ROLES[math.floor(rand() * len(_ROLES))],
                    "ip": f"10.{1 if dc_id == 'dc-east' else 2}.{idx + 1}.{10 + slot}",
                    "model": _MODELS[math.floor(rand() * len(_MODELS))],
                    "cpu": js_round(22 + rand() * 40),
                    "memory": js_round(35 + rand() * 35),
                    "storage": js_round(30 + rand() * 45),
                    "temperature": js_round(38 + rand() * 14),
                    "powerW": js_round(380 + rand() * 320),
                    "networkLatencyMs": num(js_round((0.3 + rand() * 1.4) * 10) / 10),
                    "connectivity": "online",
                    "status": "healthy",
                    "uptimeDays": js_round(20 + rand() * 300),
                }
                base.update(_HOTSPOTS.get(sid, {}))
                rack_servers.append(base)
            servers.extend(rack_servers)
            racks.append({
                "id": rack_id,
                "label": label,
                "dcId": dc_id,
                "row": label[0],
                "position": int(label[1:]),
                "powerKw": num(js_round(sum(s["powerW"] for s in rack_servers) / 100) / 10),
                "powerCapacityKw": 8,
                "inletTemp": js_round(max(s["temperature"] for s in rack_servers) * 0.45 + 4),
                "status": worst_status([s["status"] for s in rack_servers]),
            })
    return racks, servers


_ACTIVE_SEEDS = [
    dict(title="CPU saturation and thermal rise on ash-a02-03",
         description="Sustained CPU above 90% with inlet temperature climbing past 80°C. Correlated with a batch job deployed at 09:40.",
         severity="critical", status="ongoing", category="thermal", serverId="srv-a02-3", hoursAgo=0.4, source="ai"),
    dict(title="Memory pressure on Kafka broker ash-b01-02",
         description="Heap usage has grown steadily for 6 hours. Consumer lag rising on two partitions.",
         severity="major", status="investigating", category="software", serverId="srv-b01-2", hoursAgo=2.5, source="rule"),
    dict(title="Elevated inlet temperature in rack A03",
         description="CRAC unit 2 reports reduced airflow. Rack A03 inlet temperature 6°C above baseline.",
         severity="major", status="ongoing", category="thermal", serverId="srv-a03-1", hoursAgo=5, source="ai"),
    dict(title="Node hio-c02-04 unreachable",
         description="Host stopped responding to health checks. Out-of-band management reachable; PSU fault suspected.",
         severity="minor", status="investigating", category="power", serverId="srv-c02-4", hoursAgo=9, source="rule"),
]

_HISTORY = [
    dict(title="Disk latency spike on storage volume", description="p99 write latency exceeded 40 ms for 12 minutes.", severity="major", category="storage", source="rule"),
    dict(title="Packet loss on top-of-rack switch uplink", description="Intermittent 2–4% packet loss on uplink port 49.", severity="major", category="network", source="ai"),
    dict(title="Fan failure reported by BMC", description="Fan 3 reported 0 RPM. Remaining fans compensated.", severity="minor", category="hardware", source="rule"),
    dict(title="PDU branch circuit near capacity", description="Branch B at 87% of rated load during peak.", severity="major", category="power", source="ai"),
    dict(title="Certificate expiry on internal API gateway", description="TLS certificate expired, causing 5xx for internal clients.", severity="critical", category="software", source="manual"),
    dict(title="CPU throttling under thermal limit", description="Processor throttled after sustained 95% load.", severity="minor", category="thermal", source="ai"),
    dict(title="RAID array degraded", description="One member disk failed; rebuild completed after replacement.", severity="major", category="storage", source="rule"),
    dict(title="DNS resolution timeouts", description="Resolver pool saturated during deploy window.", severity="minor", category="network", source="manual"),
    dict(title="Capacity threshold reached on compute pool", description="Pool reached 85% allocated vCPU.", severity="minor", category="capacity", source="ai"),
    dict(title="UPS switched to battery", description="Utility power dip for 40 seconds; UPS carried the load.", severity="critical", category="power", source="rule"),
]


def _f(label: str, weight: float) -> dict:
    return {"label": label, "weight": weight}


_ANALYSIS: Dict[str, dict] = {
    "thermal": {
        "summary": "Temperature and CPU load rose together, following a workload change and reduced cooling airflow in the same row.",
        "rootCause": "Reduced airflow from CRAC unit 2 combined with a new CPU-heavy batch workload.",
        "rootCauseConfidence": 0.82,
        "contributingFactors": [_f("CPU utilization", 0.38), _f("Inlet temperature", 0.31), _f("Airflow (CRAC 2)", 0.19), _f("Fan speed", 0.12)],
        "remediation": [
            "Throttle or reschedule the batch job to off-peak hours.",
            "Migrate latency-sensitive workloads to rack B02, which has spare thermal headroom.",
            "Dispatch facilities to inspect CRAC unit 2 filters and airflow.",
            'Raise fan profile to "performance" until airflow is restored.',
        ],
    },
    "software": {
        "summary": "Memory usage grew linearly without plateau, consistent with a leak introduced in the latest deploy.",
        "rootCause": "Probable memory leak in consumer client v3.4.1 deployed 6 hours before onset.",
        "rootCauseConfidence": 0.74,
        "contributingFactors": [_f("Heap growth rate", 0.44), _f("Recent deployment", 0.29), _f("GC pause time", 0.17), _f("Consumer lag", 0.1)],
        "remediation": [
            "Roll back consumer client to v3.4.0.",
            "Restart the broker during the next low-traffic window to reclaim memory.",
            "Capture a heap dump before restart for the application team.",
        ],
    },
    "power": {
        "summary": "Power telemetry stopped abruptly while out-of-band management stayed reachable, pointing to a PSU fault.",
        "rootCause": "Primary power supply unit failure; redundant PSU not cabled to the B feed.",
        "rootCauseConfidence": 0.69,
        "contributingFactors": [_f("PSU voltage drop", 0.47), _f("Single power feed", 0.33), _f("PSU age", 0.2)],
        "remediation": ["Replace the failed PSU and cable the redundant PSU to the B feed.", "Audit the rack for other servers on a single feed."],
    },
    "network": {
        "summary": "Packet loss correlates with CRC errors on one uplink, suggesting a physical layer issue.",
        "rootCause": "Degraded optic on uplink port 49.",
        "rootCauseConfidence": 0.77,
        "contributingFactors": [_f("CRC errors", 0.52), _f("Optic RX power", 0.31), _f("Link flaps", 0.17)],
        "remediation": ["Replace the optic on port 49.", "Shift traffic to the secondary uplink until replaced."],
    },
    "hardware": {
        "summary": "BMC sensor data shows a single component failure with redundancy still in place.",
        "rootCause": "Fan module failure.",
        "rootCauseConfidence": 0.88,
        "contributingFactors": [_f("Fan RPM", 0.7), _f("Component age", 0.3)],
        "remediation": ["Replace the fan module during the next maintenance window."],
    },
    "storage": {
        "summary": "Write latency rose with queue depth on one volume while other volumes stayed normal.",
        "rootCause": "Degraded disk in RAID set increasing rebuild I/O.",
        "rootCauseConfidence": 0.71,
        "contributingFactors": [_f("Queue depth", 0.45), _f("SMART reallocated sectors", 0.35), _f("Rebuild I/O", 0.2)],
        "remediation": ["Replace the failing disk.", "Throttle rebuild priority during business hours."],
    },
    "capacity": {
        "summary": "Allocation trend projects pool exhaustion within two weeks at current growth.",
        "rootCause": "Organic growth without matching capacity planning.",
        "rootCauseConfidence": 0.8,
        "contributingFactors": [_f("Allocation growth", 0.6), _f("Reserved headroom", 0.4)],
        "remediation": ["Order additional compute nodes.", "Reclaim idle reservations."],
    },
}

CATEGORIES = tuple(_ANALYSIS.keys())


def analysis_for(category: str, related: Optional[List[str]] = None) -> dict:
    import copy

    a = copy.deepcopy(_ANALYSIS[category])
    a["relatedIncidentIds"] = related or []
    a["generatedBy"] = "sample"
    return a


def build_incidents(servers: List[dict], now: int, owner_name: str = "System") -> List[dict]:
    import re

    rand = mulberry32(7)
    by_id = {s["id"]: s for s in servers}
    seeds = [dict(s) for s in _ACTIVE_SEEDS]
    for i in range(38):
        t = _HISTORY[i % len(_HISTORY)]
        server = servers[math.floor(rand() * len(servers))]
        seeds.append({**t, "serverId": server["id"], "status": "resolved", "hoursAgo": 12 + rand() * 29 * 24, "resolvedAfterH": 0.3 + rand() * 6})
    seeds.sort(key=lambda s: s["hoursAgo"])
    year = datetime.fromtimestamp(now / 1000, tz=timezone.utc).year
    out = []
    for idx, seed in enumerate(seeds):
        server = by_id[seed["serverId"]]
        created_ms = now - seed["hoursAgo"] * HOUR
        created = iso_ms(created_ms)
        resolved = iso_ms(now - (seed["hoursAgo"] - seed.get("resolvedAfterH", 1)) * HOUR) if seed["status"] == "resolved" else None
        iid = f"INC-{year}-{134 - idx:04d}"
        ack = seed["status"] != "ongoing"
        src = seed["source"]
        timeline = [
            {"id": f"{iid}-t1", "at": created, "type": "created", "actor": owner_name if src == "manual" else "VaultWatch",
             "message": "Incident opened by anomaly detection (sample model)." if src == "ai" else "Incident opened by alert rule." if src == "rule" else "Incident created manually."},
            {"id": f"{iid}-t2", "at": iso_ms(created_ms + 2 * 60000), "type": "ai", "actor": "VaultWatch", "message": "Sample AI analysis attached with probable root cause."},
        ]
        if ack:
            timeline.append({"id": f"{iid}-t3", "at": iso_ms(created_ms + 9 * 60000), "type": "status", "actor": owner_name, "message": "Acknowledged and moved to Investigating."})
        if resolved:
            timeline.append({"id": f"{iid}-t4", "at": resolved, "type": "resolved", "actor": owner_name, "message": "Resolved after remediation."})
        out.append({
            "id": iid,
            "title": re.sub(r"ash-[a-z0-9-]+|hio-[a-z0-9-]+", server["hostname"], seed["title"], count=1),
            "description": seed["description"],
            "severity": seed["severity"],
            "status": seed["status"],
            "category": seed["category"],
            "serverIds": [server["id"]],
            "rackId": server["rackId"],
            "dcId": server["dcId"],
            "assigneeId": None,
            "acknowledged": ack,
            "acknowledgedAt": timeline[2]["at"] if ack else None,
            "createdAt": created,
            "updatedAt": resolved or timeline[-1]["at"],
            "resolvedAt": resolved,
            "source": src,
            "timeline": timeline,
            "analysis": analysis_for(seed["category"]),
        })
    return out


_PREDICTION_TYPES = [
    ("Thermal overload", [("Inlet temperature trend", "+4.2°C / 6h"), ("CPU utilization", "91% avg"), ("Fan speed", "92% max")], "Rebalance workloads to cooler racks and inspect row airflow."),
    ("Memory exhaustion", [("Heap growth", "+1.8 GB / h"), ("Swap activity", "rising"), ("GC pause time", "340 ms p95")], "Schedule a rolling restart and investigate the recent deploy."),
    ("Disk failure", [("SMART reallocated sectors", "112"), ("Read error rate", "3x baseline"), ("Disk age", "4.1 years")], "Pre-emptively replace the disk and verify RAID health."),
    ("Power supply fault", [("PSU voltage variance", "±4.6%"), ("PSU temperature", "61°C"), ("Single feed", "yes")], "Verify redundant PSU cabling and order a spare."),
    ("Network degradation", [("CRC errors", "240 / h"), ("Optic RX power", "-9.8 dBm"), ("Retransmits", "1.9%")], "Replace the uplink optic and move traffic to the secondary link."),
]


def build_predictions(servers: List[dict], now: int) -> List[dict]:
    rand = mulberry32(99)
    horizons = ["6h", "24h", "72h", "7d"]
    horizon_ms = {"6h": 6 * HOUR, "24h": DAY, "72h": 3 * DAY, "7d": 7 * DAY}
    forced = {"srv-a02-3": (0, 0.87, 0.92), "srv-b01-2": (1, 0.72, 0.88), "srv-a03-1": (0, 0.64, 0.81), "srv-b03-4": (2, 0.41, 0.77), "srv-d01-2": (3, 0.33, 0.69)}
    out = []
    for i, s in enumerate(servers):
        f = forced.get(s["id"])
        t_idx = f[0] if f else math.floor(rand() * len(_PREDICTION_TYPES))
        name, factors, rec = _PREDICTION_TYPES[t_idx]
        probability = f[1] if f else js_round((0.03 + rand() * 0.22) * 100) / 100
        confidence = f[2] if f else js_round((0.7 + rand() * 0.25) * 100) / 100
        horizon = ("24h" if probability > 0.8 else "72h") if f else horizons[math.floor(rand() * len(horizons))]
        expected = iso_ms(now + horizon_ms[horizon] * (0.4 + rand() * 0.5))
        out.append({
            "id": f"pred-{i + 1}",
            "serverId": s["id"],
            "rackId": s["rackId"],
            "dcId": s["dcId"],
            "type": name,
            "probability": probability,
            "confidence": confidence,
            "horizon": horizon,
            "expectedAt": expected,
            "factors": [{"label": label, "value": value, "weight": js_round((0.5 - j * 0.15 + rand() * 0.05) * 100) / 100} for j, (label, value) in enumerate(factors)],
            "recommendation": rec,
            "generatedAt": iso_ms(now - 10 * 60000),
            "sample": True,
        })
    return out


def demo_model(now: int) -> dict:
    return {"name": "Ensemble (Isolation Forest + XGBoost + BiLSTM)", "version": "sample-2.4", "confidence": 0.92, "trainedAt": iso_ms(now - 3 * DAY), "sample": True}


def build_alerts(now: int) -> List[dict]:
    rows = [
        ("CPU above 90% for 10 min", "ash-a02-03 CPU at 94%.", "critical", "active", "srv-a02-3", "rule-cpu", None, 18),
        ("Temperature above 80°C", "ash-a02-03 inlet at 82°C.", "critical", "active", "srv-a02-3", "rule-temp", None, 22),
        ("Memory above 90%", "ash-b01-02 memory at 92%.", "warning", "acknowledged", "srv-b01-2", "rule-mem", "System", 150),
        ("Host unreachable", "hio-c02-04 failed 3 consecutive health checks.", "warning", "active", "srv-c02-4", None, None, 540),
        ("Rack A03 inlet above baseline", "Inlet 6°C above 7-day baseline.", "warning", "active", "srv-a03-1", "rule-temp", None, 300),
        ("Scheduled maintenance completed", "Firmware update on rack B02 completed.", "info", "resolved", None, None, None, 1440),
        ("Disk usage above 85%", "ash-b03-01 /var at 87%.", "warning", "dismissed", "srv-b03-1", "rule-disk", "System", 2900),
        ("Latency above 5 ms", "hio-d02-03 network latency 7.1 ms.", "warning", "resolved", "srv-d02-3", "rule-lat", "System", 4300),
    ]
    return [
        {"id": f"alt-{i + 1}", "createdAt": iso_ms(now - mins * 60000), "title": t, "message": m, "severity": sev, "status": st,
         "serverId": srv, "ruleId": rule, "acknowledgedBy": ack}
        for i, (t, m, sev, st, srv, rule, ack, mins) in enumerate(rows)
    ]


def default_alert_rules() -> List[dict]:
    return [
        {"id": "rule-cpu", "name": "High CPU", "metric": "cpu", "operator": ">", "threshold": 90, "durationMin": 10, "severity": "critical", "enabled": True, "channels": ["email", "slack"]},
        {"id": "rule-mem", "name": "High memory", "metric": "memory", "operator": ">", "threshold": 90, "durationMin": 15, "severity": "warning", "enabled": True, "channels": ["email"]},
        {"id": "rule-temp", "name": "Overheating", "metric": "temperature", "operator": ">", "threshold": 80, "durationMin": 5, "severity": "critical", "enabled": True, "channels": ["email", "pagerduty"]},
        {"id": "rule-disk", "name": "Disk filling up", "metric": "storage", "operator": ">", "threshold": 85, "durationMin": 30, "severity": "warning", "enabled": True, "channels": ["email"]},
        {"id": "rule-lat", "name": "Network latency", "metric": "latency", "operator": ">", "threshold": 5, "durationMin": 5, "severity": "warning", "enabled": False, "channels": ["slack"]},
    ]


def default_notification_settings() -> dict:
    return {"email": True, "slack": False, "webhook": False, "pagerduty": False, "slackChannel": "#noc-alerts", "webhookUrl": "", "quietHours": False, "minSeverity": "warning"}


def default_monitoring() -> dict:
    return {"scrapeIntervalSec": 15, "retentionDays": 30, "anomalySensitivity": "medium", "predictionHorizon": "24h", "autoCreateIncidents": True}
