import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

# Database settings
MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://dcadmin:changeme_mongo_password@localhost:27017/datacenter_incidents?authSource=admin"
)
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "datacenter_incidents")

def resolve_mongo_client():
    # If running locally or on host, resolve standard compose aliases to localhost
    uris_to_try = [MONGO_URI]
    if "mongodb:" in MONGO_URI:
        # replace docker host 'mongodb' with 'localhost'
        uris_to_try.append(MONGO_URI.replace("@mongodb:", "@localhost:"))
    
    for uri in uris_to_try:
        try:
            print(f"Connecting to MongoDB with URI: {uri}")
            client = MongoClient(uri, serverSelectionTimeoutMS=2000)
            client.admin.command('ping')
            print("Successfully connected to MongoDB!")
            return client
        except ConnectionFailure:
            continue
    print("Error: Could not connect to MongoDB on any of the attempted URIs.")
    sys.exit(1)

def seed_database():
    client = resolve_mongo_client()
    db = client[MONGO_DB_NAME]
    
    # 1. Clear Collections
    print("Clearing existing collections (servers, metrics, incidents)...")
    db.servers.drop()
    db.metrics.drop()
    db.incidents.drop()
    
    # 2. Seed Servers
    print("Seeding 10 servers...")
    server_types = [
        {"name": "Standard Compute Node", "prefix": "std", "cores": 8, "ram": 32, "disk": 500, "loc": "Rack-A01"},
        {"name": "High-CPU Compute Node", "prefix": "hcpu", "cores": 32, "ram": 64, "disk": 1000, "loc": "Rack-A02"},
        {"name": "Memory Optimized DB Server", "prefix": "mem", "cores": 16, "ram": 256, "disk": 2000, "loc": "Rack-B01"},
        {"name": "Storage Optimized Node", "prefix": "stor", "cores": 12, "ram": 64, "disk": 8000, "loc": "Rack-B02"},
        {"name": "Edge Gateway Node", "prefix": "edge", "cores": 4, "ram": 16, "disk": 250, "loc": "Rack-C01"},
    ]
    
    servers = []
    hostnames = []
    for i in range(1, 11):
        srv_type = server_types[(i - 1) % len(server_types)]
        hostname = f"server-{i:02d}"
        hostnames.append(hostname)
        
        server = {
            "name": f"{srv_type['name']} {i}",
            "hostname": hostname,
            "ip_address": f"10.0.1.{10 + i}",
            "status": "active",
            "cpu_cores": srv_type["cores"],
            "ram_gb": srv_type["ram"],
            "disk_gb": srv_type["disk"],
            "location": srv_type["loc"],
            "created_at": datetime.now(timezone.utc) - timedelta(days=30)
        }
        servers.append(server)
        
    db.servers.insert_many(servers)
    print(f"Inserted {len(servers)} servers.")
    
    # 3. Create 20 Incidents with Realistic Alignments
    print("Generating 20 incidents...")
    incident_configs = [
        {"type": "cpu_spike", "severity": "high", "notes": "Unusually high CPU utilization detected.", "duration_mins": 45},
        {"type": "memory_leak", "severity": "medium", "notes": "Continuous increase in RAM usage without cooling down.", "duration_mins": 180},
        {"type": "disk_failure", "severity": "critical", "notes": "I/O latency threshold exceeded, potential disk failure.", "duration_mins": 60},
        {"type": "network_anomaly", "severity": "medium", "notes": "Abnormal traffic volume detected on network interfaces.", "duration_mins": 30},
        {"type": "thermal_event", "severity": "high", "notes": "Core temperature exceeded safety thresholds.", "duration_mins": 40},
        {"type": "predicted_outage", "severity": "critical", "notes": "ML models forecast service outage based on multi-metric trend.", "duration_mins": 120},
    ]
    
    now = datetime.now(timezone.utc)
    incidents = []
    anomaly_periods = {}  # Key: hostname, Value: list of (start_time, end_time, type)
    
    for i in range(20):
        config = random.choice(incident_configs)
        hostname = random.choice(hostnames)
        
        # Distribute incidents randomly across the last 7 days
        days_ago = random.uniform(0.5, 6.5)
        detected_at = now - timedelta(days=days_ago)
        if detected_at.tzinfo is None:
            detected_at = detected_at.replace(tzinfo=timezone.utc)
            
        # Decide if resolved (most past ones are resolved, some recent ones remain active)
        resolved = days_ago > 1.0 or random.random() < 0.7
        resolved_at = None
        if resolved:
            resolved_at = detected_at + timedelta(minutes=config["duration_mins"])
            
        incident = {
            "server_id": hostname,
            "detected_at": detected_at,
            "resolved_at": resolved_at,
            "severity": config["severity"],
            "incident_type": config["type"],
            "anomaly_score": round(random.uniform(0.7, 0.99), 2),
            "model_used": "isolation_forest+xgboost",
            "acknowledged": resolved or random.random() < 0.5,
            "notes": config["notes"]
        }
        incidents.append(incident)
        
        # Track anomaly periods to inject anomalies during metric generation
        end_time = resolved_at if resolved_at else detected_at + timedelta(minutes=config["duration_mins"])
        if hostname not in anomaly_periods:
            anomaly_periods[hostname] = []
        anomaly_periods[hostname].append((detected_at, end_time, config["type"]))
        
    db.incidents.insert_many(incidents)
    print(f"Inserted {len(incidents)} incidents.")
    
    # Update server statuses to anomalous if they have open high/critical incidents
    for incident in incidents:
        if incident["resolved_at"] is None and incident["severity"] in ["high", "critical"]:
            db.servers.update_one(
                {"hostname": incident["server_id"]},
                {"$set": {"status": "anomalous"}}
            )
            
    # 4. Generate 7 Days of Historical Metrics (1-minute intervals)
    # Total points per server = 7 days * 24h * 60m = 10,080 points
    print("Generating 7 days of historical metrics (10,080 points per server)...")
    total_minutes = 7 * 24 * 60
    
    for hostname in hostnames:
        print(f"Generating metrics for {hostname}...")
        server_anomalies = anomaly_periods.get(hostname, [])
        metrics_batch = []
        
        # Pre-seed RAM base leak state
        ram_leak_accumulation = 0.0
        
        for m in range(total_minutes):
            timestamp = now - timedelta(minutes=total_minutes - m)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            
            # Check if this timestamp falls within an anomaly period for this server
            active_anomaly_type = None
            for start_t, end_t, anomaly_type in server_anomalies:
                if start_t <= timestamp <= end_t:
                    active_anomaly_type = anomaly_type
                    break
            
            # Default normal ranges
            cpu_pct = random.uniform(15.0, 45.0)
            ram_pct = random.uniform(30.0, 50.0) + ram_leak_accumulation
            disk_io = random.uniform(2.0, 15.0)
            net_mbps = random.uniform(10.0, 80.0)
            disk_used = random.uniform(40.0, 45.0) + (m / total_minutes) * 5.0
            
            # Simulate memory leak drift
            ram_leak_accumulation += random.uniform(0.0005, 0.0015)
            if m % 1440 == 0:  # reset daily
                ram_leak_accumulation = 0.0
                
            # Inject anomalous telemetry if an incident was active at this time
            if active_anomaly_type == "cpu_spike":
                cpu_pct = random.uniform(85.0, 99.0)
            elif active_anomaly_type == "memory_leak":
                ram_pct = random.uniform(88.0, 98.0)
            elif active_anomaly_type == "disk_failure":
                disk_io = random.uniform(350.0, 550.0)
            elif active_anomaly_type == "network_anomaly":
                net_mbps = random.uniform(800.0, 1200.0)
            elif active_anomaly_type == "thermal_event":
                cpu_pct = random.uniform(80.0, 95.0)
            elif active_anomaly_type == "predicted_outage":
                cpu_pct = random.uniform(90.0, 98.0)
                ram_pct = random.uniform(90.0, 98.0)
                
            # Correlate temp with CPU
            temp_celsius = 30.0 + cpu_pct * 0.5 + random.uniform(-1.0, 1.0)
            if active_anomaly_type == "thermal_event":
                temp_celsius = random.uniform(85.0, 95.0)
                
            metric_doc = {
                "timestamp": timestamp,
                "server_id": hostname,
                "cpu_pct": round(cpu_pct, 2),
                "ram_pct": round(ram_pct, 2),
                "disk_io_mbps": round(disk_io, 2),
                "net_mbps": round(net_mbps, 2),
                "temp_celsius": round(temp_celsius, 2),
                "disk_used_pct": round(disk_used, 2)
            }
            metrics_batch.append(metric_doc)
            
            if len(metrics_batch) >= 2000:
                db.metrics.insert_many(metrics_batch)
                metrics_batch = []
                
        # Insert remaining
        if metrics_batch:
            db.metrics.insert_many(metrics_batch)
            
    print("Database seeding completed successfully!")
    client.close()

if __name__ == "__main__":
    seed_database()
