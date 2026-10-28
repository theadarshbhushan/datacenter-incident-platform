"""
Root-cause assistance from explainable rules. No LLM is involved.

Inputs are facts already in the database: the latest per-metric anomaly scores of the affected servers,
their rack-mates, correlated alerts and incident history. The output is a *suspected* cause with the
evidence behind it. It becomes "confirmed" only when a person confirms it on the incident.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from app.ml.inference import METRIC_INFO, RECOMMENDATIONS, fmt

ELEVATED = 0.95  # anomaly-score percentile treated as unusual for explanations


def _elevated(metrics: Dict[str, dict], name: str) -> Optional[dict]:
    m = metrics.get(name)
    return m if m and (m.get("anomalyScore") or 0) >= ELEVATED else None


def _metric_line(name: str, m: dict) -> str:
    med = m.get("median")
    base = f" vs 24h median {fmt(name, med)}" if med is not None else ""
    return f"{METRIC_INFO[name]['label']} {fmt(name, m.get('current'))}{base} (anomaly score {m['anomalyScore']:.2f})"


def analyze(
    category: str,
    metrics: Dict[str, dict],
    offline: bool,
    rack_label: Optional[str],
    rack_mates_with_same_anomaly: int,
    rack_size: int,
    active_alerts: List[dict],
    similar_incidents: List[str],
    model_version: Optional[str],
    generated_at: str,
) -> dict:
    """
    `metrics` maps metric -> {"anomalyScore", "current", "median"} for the primary server.
    Returns the AIAnalysis shape (see dc-frontend/src/types/domain.ts).
    """
    evidence: List[str] = []
    factors = []
    for name, m in sorted(metrics.items(), key=lambda kv: -(kv[1].get("anomalyScore") or 0)):
        if m.get("anomalyScore") is None:
            continue
        factors.append({"label": METRIC_INFO[name]["label"], "weight": round(float(m["anomalyScore"]), 2), "value": fmt(name, m.get("current"))})
        if m["anomalyScore"] >= ELEVATED:
            evidence.append(_metric_line(name, m))
    factors = factors[:5]

    cpu, mem, temp = _elevated(metrics, "cpu"), _elevated(metrics, "memory"), _elevated(metrics, "temperature")
    disk_io, storage, net = _elevated(metrics, "disk_io"), _elevated(metrics, "storage"), _elevated(metrics, "network")
    lat, power = _elevated(metrics, "latency"), _elevated(metrics, "power")
    rack_wide = rack_mates_with_same_anomaly >= 2
    if rack_wide:
        evidence.append(f"{rack_mates_with_same_anomaly} other servers in rack {rack_label or '?'} show the same kind of anomaly.")
    if active_alerts:
        evidence.append(f"{len(active_alerts)} active alert(s) on the affected servers: " + "; ".join(a["title"] for a in active_alerts[:3]) + ".")
    if similar_incidents:
        evidence.append(f"{len(similar_incidents)} similar incident(s) on this server in the last 30 days: {', '.join(similar_incidents[:3])}.")

    cause, steps = None, []
    if offline:
        cause = "The server stopped sending telemetry (host down, agent stopped, or network path lost)."
        steps = ["Check the host through out-of-band management (iDRAC/iLO/IPMI).", "Check the monitoring agent service and its logs.", "Check the switch port and recent network changes."]
        evidence.insert(0, "No telemetry received for more than 10 minutes.")
    elif temp and rack_wide:
        cause = "Rack-level cooling problem: several servers in the same rack are running hot."
        steps = ["Check CRAC/CRAH units and airflow for this row.", "Check blanking panels and cable obstructions in the rack.", "Move heavy workloads out of the rack until temperatures recover."]
    elif temp and cpu:
        cause = "Heat from sustained CPU load."
        steps = ["Identify the workload driving CPU and reschedule or throttle it.", "Confirm fans respond to the higher load.", RECOMMENDATIONS["thermal"]]
    elif temp:
        cause = "Cooling or airflow problem on this server (temperature rose without a matching CPU increase)."
        steps = ["Check fan status and speeds in the BMC.", "Check inlet temperature and airflow at the rack.", RECOMMENDATIONS["thermal"]]
    elif mem and (mem.get("current") or 0) > (mem.get("median") or 0):
        cause = "Memory growth on this server, consistent with a leak or a workload change."
        steps = ["Find the process whose memory keeps growing.", "Check deploys around the time the growth started.", RECOMMENDATIONS["software"]]
    elif cpu and net:
        cause = "Traffic surge: network throughput and CPU rose together."
        steps = ["Check request rates and traffic sources.", "Scale out or rate-limit if the traffic is legitimate.", RECOMMENDATIONS["capacity"]]
    elif cpu:
        cause = "CPU-bound workload change on this server."
        steps = [RECOMMENDATIONS["capacity"], "Compare with the server's normal daily pattern before acting."]
    elif storage:
        cause = "Disk usage moving away from its normal level (volume filling or being cleared)."
        steps = [RECOMMENDATIONS["storage"]]
    elif disk_io:
        cause = "Unusual disk activity (heavy writes or reads compared with this server's baseline)."
        steps = ["Find the process doing the I/O (iotop).", RECOMMENDATIONS["storage"]]
    elif (net or lat) and rack_wide:
        cause = "Shared network path problem: several servers in the rack show network anomalies (top-of-rack switch or uplink)."
        steps = ["Check the top-of-rack switch and its uplinks for errors.", RECOMMENDATIONS["network"]]
    elif net or lat:
        cause = "Network anomaly on this server (throughput or latency far from its baseline)."
        steps = [RECOMMENDATIONS["network"]]
    elif power and rack_wide:
        cause = "Power feed or PDU problem affecting several servers in the rack."
        steps = ["Check the PDU and branch circuit for the rack.", RECOMMENDATIONS["power"]]
    elif power:
        cause = "Power draw far from this server's baseline (PSU fault or load change)."
        steps = [RECOMMENDATIONS["power"]]

    independent = sum(bool(x) for x in (any(m.get("anomalyScore", 0) >= ELEVATED for m in metrics.values()), rack_wide, active_alerts, similar_incidents, offline))
    if cause is None:
        has_data = bool(metrics)
        return {
            "summary": "No metric on the affected servers is unusual right now, so there is no data-driven cause to suggest." if has_data
            else "This incident is not linked to a server with telemetry, so no data-driven cause can be suggested.",
            "rootCause": "Not enough evidence to suggest a cause.",
            "rootCauseStatus": "unknown",
            "evidenceStrength": "none",
            "evidence": evidence,
            "contributingFactors": factors,
            "remediation": [f"General guidance: {RECOMMENDATIONS[category]}"] if category in RECOMMENDATIONS else [],
            "relatedIncidentIds": similar_incidents,
            "generatedBy": "rules",
            "generatedAt": generated_at,
            "modelVersion": model_version,
        }
    strength = "strong" if independent >= 2 else "moderate"
    return {
        "summary": f"Suspected cause based on {len(evidence)} piece(s) of evidence from telemetry and history. Verify before acting on it.",
        "rootCause": cause,
        "rootCauseStatus": "suspected",
        "evidenceStrength": strength,
        "evidence": evidence,
        "contributingFactors": factors,
        "remediation": steps,
        "relatedIncidentIds": similar_incidents,
        "generatedBy": "rules",
        "generatedAt": generated_at,
        "modelVersion": model_version,
    }
