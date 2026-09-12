#!/usr/bin/env python3
"""
Preprocess and Unify Datasets for Data Center Incident Platform ML Models
Converts NAB AWS CloudWatch and Azure Public Dataset VM traces into a standardized schema:
timestamp, server_id, cpu_pct, ram_pct, disk_io_mbps, net_mbps, temp_celsius, disk_used_pct, is_anomaly, anomaly_type

Produces:
- dc-ml/datasets/processed/train.csv (80%)
- dc-ml/datasets/processed/test.csv (20%)
- dc-ml/datasets/processed/anomalies_only.csv
- dc-ml/datasets/processed/stats.json
"""

import os
import sys
import json
import gzip
import random
from pathlib import Path
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

# Ensure UTF-8 console output on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
NAB_DIR = BASE_DIR / "dc-ml" / "datasets" / "nab"
AZURE_DIR = BASE_DIR / "dc-ml" / "datasets" / "azure"
PROCESSED_DIR = BASE_DIR / "dc-ml" / "datasets" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Set seed for reproducibility
RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)


def load_nab_windows(nab_dir: Path) -> dict:
    """Load and parse anomaly windows from combined_windows.json."""
    windows_file = nab_dir / "combined_windows.json"
    if not windows_file.exists():
        print(f"Warning: {windows_file} not found.")
        return {}

    with open(windows_file, "r", encoding="utf-8") as f:
        raw_windows = json.load(f)

    parsed_windows = {}
    for key, interval_list in raw_windows.items():
        parsed_intervals = []
        for interval in interval_list:
            start_dt = pd.to_datetime(interval[0])
            end_dt = pd.to_datetime(interval[1])
            parsed_intervals.append((start_dt, end_dt))
        parsed_windows[key] = parsed_intervals

    return parsed_windows


def determine_anomaly_type(cpu_pct, ram_pct, disk_io_mbps, net_mbps, is_anomaly):
    """
    Apply anomaly classification rules:
    if cpu_pct > 85: "cpu_spike"
    elif ram_pct > 88: "memory_leak"
    elif disk_io_mbps > 100: "disk_failure"
    elif net_mbps > 50: "network_anomaly"
    elif is_anomaly: "thermal_event"
    else: "normal"
    """
    if cpu_pct > 85.0:
        return True, "cpu_spike"
    elif ram_pct > 88.0:
        return True, "memory_leak"
    elif disk_io_mbps > 100.0:
        return True, "disk_failure"
    elif net_mbps > 50.0:
        return True, "network_anomaly"
    elif is_anomaly:
        return True, "thermal_event"
    else:
        return False, "normal"


def process_nab_datasets(nab_dir: Path, windows_map: dict) -> pd.DataFrame:
    """Process 8 NAB CSV files and map to server-01 through server-08."""
    print("\n" + "=" * 70)
    print("STEP 1: Processing NAB Datasets (server-01 to server-08)")
    print("=" * 70)

    nab_mapping = [
        ("ec2_cpu_utilization_24ae8d.csv", "server-01", "cpu"),
        ("ec2_cpu_utilization_53ea38.csv", "server-02", "cpu"),
        ("ec2_cpu_utilization_77c1ef.csv", "server-03", "cpu"),
        ("ec2_cpu_utilization_825cc2.csv", "server-04", "cpu"),
        ("ec2_cpu_utilization_ac20cd.csv", "server-05", "cpu"),
        ("ec2_disk_write_bytes_1ef3de.csv", "server-06", "disk"),
        ("ec2_network_in_257a54.csv", "server-07", "net"),
        ("rds_cpu_utilization_cc0c53.csv", "server-08", "cpu"),
    ]

    all_rows = []

    for filename, server_id, metric_type in nab_mapping:
        file_path = nab_dir / filename
        if not file_path.exists():
            print(f"  [Skip] {filename} not found in {nab_dir}")
            continue

        # Find window key in combined_windows.json
        window_key = f"realAWSCloudwatch/{filename}"
        if window_key not in windows_map and "77c1" in filename:
            window_key = "realAWSCloudwatch/ec2_cpu_utilization_77c1ca.csv"

        intervals = windows_map.get(window_key, [])

        df = pd.read_csv(file_path)
        df["dt"] = pd.to_datetime(df["timestamp"])

        anom_count = 0
        for _, row in df.iterrows():
            ts = row["timestamp"]
            dt_val = row["dt"]
            val = float(row["value"])

            # Check if timestamp falls within anomaly windows
            in_window = any(start <= dt_val <= end for start, end in intervals)
            is_anomaly = in_window

            # Map primary metric and synthesize correlated secondary metrics
            if metric_type == "cpu":
                cpu_pct = min(100.0, max(0.0, val))
                disk_io_mbps = max(0.1, random.uniform(2.0, 25.0) + (10.0 if cpu_pct > 70 else 0.0))
                net_mbps = max(0.1, random.uniform(1.0, 20.0) + (12.0 if cpu_pct > 70 else 0.0))
            elif metric_type == "disk":
                # Convert bytes to MB
                disk_io_mbps = max(0.0, val / 1048576.0)
                cpu_pct = min(100.0, max(5.0, min(disk_io_mbps * 0.4, 40.0) + random.uniform(10.0, 30.0)))
                net_mbps = max(0.1, random.uniform(1.0, 20.0))
            elif metric_type == "net":
                # Convert bytes to MB
                net_mbps = max(0.0, val / 1048576.0)
                cpu_pct = min(100.0, max(5.0, min(net_mbps * 0.5, 40.0) + random.uniform(10.0, 30.0)))
                disk_io_mbps = max(0.1, random.uniform(2.0, 20.0))

            # Correlated metrics:
            # ram_pct = min(100, cpu_pct * 0.85 + random(-10,10))
            # temp_celsius = 30 + cpu_pct * 0.5 + random(-3,3)
            # disk_used_pct = random(40, 75) (stable)
            ram_pct = min(100.0, max(5.0, cpu_pct * 0.85 + random.uniform(-10.0, 10.0)))
            temp_celsius = 30.0 + cpu_pct * 0.5 + random.uniform(-3.0, 3.0)
            disk_used_pct = random.uniform(40.0, 75.0)

            # Determine anomaly type and final flag
            final_is_anomaly, anomaly_type = determine_anomaly_type(
                cpu_pct, ram_pct, disk_io_mbps, net_mbps, is_anomaly
            )

            if final_is_anomaly:
                anom_count += 1

            all_rows.append({
                "timestamp": str(ts),
                "server_id": server_id,
                "cpu_pct": round(cpu_pct, 2),
                "ram_pct": round(ram_pct, 2),
                "disk_io_mbps": round(disk_io_mbps, 2),
                "net_mbps": round(net_mbps, 2),
                "temp_celsius": round(temp_celsius, 2),
                "disk_used_pct": round(disk_used_pct, 2),
                "is_anomaly": final_is_anomaly,
                "anomaly_type": anomaly_type
            })

        print(f"  Processed {server_id} ({filename}): {len(df):,} rows, {anom_count:,} anomalies ({anom_count / len(df) * 100:.1f}%)")

    nab_df = pd.DataFrame(all_rows)
    print(f"  -> Total NAB records: {len(nab_df):,}")
    return nab_df


def process_azure_dataset(azure_dir: Path, target_samples: int = 10000) -> pd.DataFrame:
    """Process Azure VM traces into server-09 and server-10."""
    print("\n" + "=" * 70)
    print("STEP 2: Processing Azure VM Traces (server-09 & server-10)")
    print("=" * 70)

    gz_file = azure_dir / "trace_data_vmtable_vmtable.csv.gz"
    if not gz_file.exists():
        print(f"  [Error] {gz_file} not found.")
        return pd.DataFrame()

    raw_records = []
    print(f"  Reading sample of {target_samples:,} records from {gz_file.name}...")

    with gzip.open(gz_file, "rt", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            if i >= target_samples:
                break
            parts = line.strip().split(",")
            if len(parts) >= 11:
                try:
                    created_sec = int(parts[3])
                    avg_cpu = float(parts[6])
                    raw_records.append((created_sec, avg_cpu))
                except (ValueError, IndexError):
                    continue

    if not raw_records:
        print("  [Error] No valid records parsed from Azure trace.")
        return pd.DataFrame()

    print(f"  Successfully extracted {len(raw_records):,} records.")

    # 3-sigma rule for anomaly detection:
    # mean = cpu_pct.mean()
    # std = cpu_pct.std()
    # is_anomaly = cpu_pct > mean + 2.5*std
    cpu_values = np.array([r[1] for r in raw_records])
    mean_cpu = cpu_values.mean()
    std_cpu = cpu_values.std()
    sigma_threshold = mean_cpu + 2.5 * std_cpu

    print(f"  Azure CPU 3-Sigma Stats: Mean={mean_cpu:.2f}%, Std={std_cpu:.2f}%, Threshold={sigma_threshold:.2f}%")

    base_time = datetime(2014, 2, 14, 0, 0, 0)
    azure_rows = []

    for idx, (created_sec, avg_cpu) in enumerate(raw_records):
        # Assign server_id: server-09 (first half), server-10 (second half)
        server_id = "server-09" if idx < len(raw_records) // 2 else "server-10"

        # Timestamp offset formatted as YYYY-MM-DD HH:MM:SS
        row_dt = base_time + timedelta(seconds=(created_sec % (60 * 86400)))
        ts_str = row_dt.strftime("%Y-%m-%d %H:%M:%S")

        cpu_pct = min(100.0, max(0.0, avg_cpu))
        is_3sigma_anomaly = bool(cpu_pct > sigma_threshold)

        # Correlated metrics
        ram_pct = min(100.0, max(5.0, cpu_pct * 0.85 + random.uniform(-10.0, 10.0)))
        temp_celsius = 30.0 + cpu_pct * 0.5 + random.uniform(-3.0, 3.0)
        disk_used_pct = random.uniform(40.0, 75.0)

        # Secondary metrics with occasional spikes if 3-sigma anomaly
        disk_spike = 110.0 if (is_3sigma_anomaly and random.random() < 0.15) else 0.0
        net_spike = 60.0 if (is_3sigma_anomaly and random.random() < 0.15) else 0.0
        disk_io_mbps = max(0.1, random.uniform(2.0, 25.0) + disk_spike)
        net_mbps = max(0.1, random.uniform(1.0, 20.0) + net_spike)

        final_is_anomaly, anomaly_type = determine_anomaly_type(
            cpu_pct, ram_pct, disk_io_mbps, net_mbps, is_3sigma_anomaly
        )

        azure_rows.append({
            "timestamp": ts_str,
            "server_id": server_id,
            "cpu_pct": round(cpu_pct, 2),
            "ram_pct": round(ram_pct, 2),
            "disk_io_mbps": round(disk_io_mbps, 2),
            "net_mbps": round(net_mbps, 2),
            "temp_celsius": round(temp_celsius, 2),
            "disk_used_pct": round(disk_used_pct, 2),
            "is_anomaly": final_is_anomaly,
            "anomaly_type": anomaly_type
        })

    azure_df = pd.DataFrame(azure_rows)
    s9_count = (azure_df["server_id"] == "server-09").sum()
    s10_count = (azure_df["server_id"] == "server-10").sum()
    anom_count = azure_df["is_anomaly"].sum()
    print(f"  Processed Azure: server-09={s9_count:,} rows, server-10={s10_count:,} rows")
    print(f"  Azure Anomalies: {anom_count:,} ({anom_count / len(azure_df) * 100:.1f}%)")

    return azure_df


def combine_and_save(nab_df: pd.DataFrame, azure_df: pd.DataFrame, processed_dir: Path):
    """Combine, shuffle, split into train/test/anomalies_only, and save stats."""
    print("\n" + "=" * 70)
    print("STEP 3: Combining, Shuffling, and Splitting Datasets")
    print("=" * 70)

    combined_df = pd.concat([nab_df, azure_df], ignore_index=True)

    # Column ordering as specified in UNIFIED OUTPUT FORMAT
    column_order = [
        "timestamp",
        "server_id",
        "cpu_pct",
        "ram_pct",
        "disk_io_mbps",
        "net_mbps",
        "temp_celsius",
        "disk_used_pct",
        "is_anomaly",
        "anomaly_type",
    ]
    combined_df = combined_df[column_order]

    # Split 80% train, 20% test with stratification by is_anomaly
    train_df, test_df = train_test_split(
        combined_df,
        test_size=0.20,
        random_state=RANDOM_SEED,
        shuffle=True,
        stratify=combined_df["is_anomaly"]
    )

    # Anomalies only subset
    anomalies_df = combined_df[combined_df["is_anomaly"] == True].copy()

    # Save CSV files
    train_path = processed_dir / "train.csv"
    test_path = processed_dir / "test.csv"
    anomalies_path = processed_dir / "anomalies_only.csv"

    train_df.to_csv(train_path, index=False)
    test_df.to_csv(test_path, index=False)
    anomalies_df.to_csv(anomalies_path, index=False)

    print(f"  [OK] Saved train.csv:          {len(train_df):,} records ({os.path.getsize(train_path) / (1024 * 1024):.2f} MB)")
    print(f"  [OK] Saved test.csv:           {len(test_df):,} records ({os.path.getsize(test_path) / (1024 * 1024):.2f} MB)")
    print(f"  [OK] Saved anomalies_only.csv: {len(anomalies_df):,} records ({os.path.getsize(anomalies_path) / 1024:.2f} KB)")

    # Compute detailed statistics
    total_records = len(combined_df)
    anomaly_count = int(combined_df["is_anomaly"].sum())
    anomaly_percentage = round((anomaly_count / total_records) * 100, 2)
    server_counts = combined_df["server_id"].value_counts().sort_index().to_dict()
    anomaly_type_counts = combined_df["anomaly_type"].value_counts().to_dict()

    # Parse dates for range
    dates = pd.to_datetime(combined_df["timestamp"], errors="coerce").dropna()
    min_date = dates.min().strftime("%Y-%m-%d %H:%M:%S")
    max_date = dates.max().strftime("%Y-%m-%d %H:%M:%S")

    stats = {
        "total_records": total_records,
        "train_records": len(train_df),
        "test_records": len(test_df),
        "anomaly_count": anomaly_count,
        "anomaly_percentage": anomaly_percentage,
        "records_per_server": {k: int(v) for k, v in server_counts.items()},
        "anomaly_type_distribution": {k: int(v) for k, v in anomaly_type_counts.items()},
        "date_range": {
            "start": min_date,
            "end": max_date
        }
    }

    stats_path = processed_dir / "stats.json"
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print(f"  [OK] Saved stats.json:         {stats_path}")

    # Print Final Summary
    print("\n" + "=" * 70)
    print("FINAL PREPROCESSING STATS")
    print("=" * 70)
    print(f"Total Records:             {total_records:,}")
    print(f"Train Records (80%):       {len(train_df):,}")
    print(f"Test Records (20%):        {len(test_df):,}")
    print(f"Total Anomalies:           {anomaly_count:,} ({anomaly_percentage}%)")
    print(f"Date Range:                {min_date}  -->  {max_date}")

    print("\nRecords per server_id:")
    print("-" * 35)
    for s_id, cnt in sorted(server_counts.items()):
        s_anom = (combined_df[combined_df["server_id"] == s_id]["is_anomaly"] == True).sum()
        print(f"  {s_id:<12}: {cnt:>6,} rows  ({s_anom:>4,} anomalies, {s_anom / cnt * 100:>5.1f}%)")

    print("\nAnomaly Type Distribution:")
    print("-" * 35)
    for atype, cnt in sorted(anomaly_type_counts.items(), key=lambda x: -x[1]):
        pct = cnt / total_records * 100
        print(f"  {atype:<18}: {cnt:>6,}  ({pct:>5.2f}%)")

    print("\nFirst 5 Rows of Unified Output (train.csv):")
    print("-" * 70)
    preview = train_df.head(5)
    print(preview.to_string(index=False))

    print("\n" + "=" * 70)
    print("PREPROCESSING COMPLETE")
    print("=" * 70)


def main():
    windows_map = load_nab_windows(NAB_DIR)
    nab_df = process_nab_datasets(NAB_DIR, windows_map)
    azure_df = process_azure_dataset(AZURE_DIR, target_samples=10000)
    combine_and_save(nab_df, azure_df, PROCESSED_DIR)


if __name__ == "__main__":
    main()
