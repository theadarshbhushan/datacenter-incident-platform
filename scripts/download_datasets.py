#!/usr/bin/env python3
"""
Dataset Download Script for Data Center Incident Platform ML Models
Downloads:
1. Yahoo Anomaly Benchmark (NAB - realAWSCloudwatch subset & anomaly labels)
2. Google Cluster Traces overview & Azure Public Dataset VM traces (subset)
Generates download summaries, previews first 5 rows of each CSV, and logs output.
"""

import os
import sys
import time
import json
import gzip
import shutil
import requests
from pathlib import Path

# Fix Windows console encoding for UTF-8 support
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Paths configuration
BASE_DIR = Path(__file__).resolve().parent.parent
DATASETS_DIR = BASE_DIR / "dc-ml" / "datasets"
NAB_DIR = DATASETS_DIR / "nab"
AZURE_DIR = DATASETS_DIR / "azure"
GOOGLE_DIR = DATASETS_DIR / "google"
LOG_FILE = DATASETS_DIR / "download_log.txt"

# Ensure directories exist
for d in [DATASETS_DIR, NAB_DIR, AZURE_DIR, GOOGLE_DIR]:
    d.mkdir(parents=True, exist_ok=True)


class DualLogger:
    """Logs messages to both stdout and a log file."""
    def __init__(self, filepath):
        self.filepath = filepath
        self.file = open(filepath, "w", encoding="utf-8")

    def log(self, message=""):
        try:
            print(message)
        except UnicodeEncodeError:
            print(message.encode("ascii", errors="replace").decode("ascii"))
        self.file.write(message + "\n")
        self.file.flush()

    def close(self):
        if self.file and not self.file.closed:
            self.file.close()


logger = DualLogger(LOG_FILE)


def format_size(size_bytes):
    """Format bytes into human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def download_file(url, dest_path, fallback_urls=None, chunk_size=1024 * 1024 * 2):
    """
    Downloads a file with streaming and optional fallback URLs.
    Returns (success, final_url, size_bytes, elapsed_seconds).
    """
    urls_to_try = [url] + (fallback_urls or [])
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DataCenter-ML/1.0"}

    for attempt_url in urls_to_try:
        try:
            logger.log(f"  Fetching: {attempt_url}")
            t0 = time.time()
            with requests.get(attempt_url, headers=headers, stream=True, timeout=60) as r:
                if r.status_code == 404:
                    logger.log(f"  [404 Not Found] trying fallback if available...")
                    continue
                r.raise_for_status()

                total_length = r.headers.get("content-length")
                total_bytes = int(total_length) if total_length else None
                downloaded = 0

                temp_dest = dest_path.with_suffix(dest_path.suffix + ".tmp")
                with open(temp_dest, "wb") as f:
                    last_log_time = time.time()
                    for chunk in r.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            now = time.time()
                            if total_bytes and (now - last_log_time >= 5 or downloaded == total_bytes):
                                pct = (downloaded / total_bytes) * 100
                                logger.log(
                                    f"    -> Progress: {format_size(downloaded)} / {format_size(total_bytes)} ({pct:.1f}%)"
                                )
                                last_log_time = now

                shutil.move(str(temp_dest), str(dest_path))
                elapsed = time.time() - t0
                file_size = os.path.getsize(dest_path)
                logger.log(
                    f"  [OK] Saved to: {dest_path.name} ({format_size(file_size)}) in {elapsed:.2f}s"
                )
                return True, attempt_url, file_size, elapsed
        except Exception as e:
            logger.log(f"  [Error] Failed from {attempt_url}: {e}")

    return False, None, 0, 0


def preview_file(file_path, num_rows=5):
    """Reads and returns the first `num_rows` lines of a CSV or gzip CSV file."""
    lines = []
    try:
        if file_path.name.endswith(".gz"):
            with gzip.open(file_path, "rt", encoding="utf-8", errors="replace") as f:
                for _ in range(num_rows):
                    line = f.readline()
                    if not line:
                        break
                    lines.append(line.rstrip())
        else:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                for _ in range(num_rows):
                    line = f.readline()
                    if not line:
                        break
                    lines.append(line.rstrip())
    except Exception as e:
        lines = [f"[Error reading file preview: {e}]"]
    return lines


def main():
    logger.log("=" * 80)
    logger.log("DATA CENTER INCIDENT PLATFORM -- DATASET DOWNLOADER")
    logger.log(f"Target Directory: {DATASETS_DIR}")
    logger.log(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.log("=" * 80)

    downloaded_records = []

    # -------------------------------------------------------------------------
    # 1. YAHOO ANOMALY BENCHMARK (NAB realAWSCloudwatch & Labels)
    # -------------------------------------------------------------------------
    logger.log("\n[1/3] Downloading Yahoo Anomaly Benchmark (NAB) Datasets...")
    nab_files = [
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_cpu_utilization_24ae8d.csv",
            NAB_DIR / "ec2_cpu_utilization_24ae8d.csv",
            []
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_cpu_utilization_53ea38.csv",
            NAB_DIR / "ec2_cpu_utilization_53ea38.csv",
            []
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_cpu_utilization_77c1ef.csv",
            NAB_DIR / "ec2_cpu_utilization_77c1ef.csv",
            # Fallback to the actual file in NAB repo (77c1ca)
            ["https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_cpu_utilization_77c1ca.csv"]
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_cpu_utilization_825cc2.csv",
            NAB_DIR / "ec2_cpu_utilization_825cc2.csv",
            []
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_cpu_utilization_ac20cd.csv",
            NAB_DIR / "ec2_cpu_utilization_ac20cd.csv",
            []
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_disk_write_bytes_1ef3de.csv",
            NAB_DIR / "ec2_disk_write_bytes_1ef3de.csv",
            []
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/ec2_network_in_257a54.csv",
            NAB_DIR / "ec2_network_in_257a54.csv",
            []
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/data/realAWSCloudwatch/rds_cpu_utilization_cc0c53.csv",
            NAB_DIR / "rds_cpu_utilization_cc0c53.csv",
            []
        ),
        (
            "https://raw.githubusercontent.com/numenta/NAB/master/labels/combined_windows.json",
            NAB_DIR / "combined_windows.json",
            []
        ),
    ]

    for url, dest, fallbacks in nab_files:
        success, final_url, size, elapsed = download_file(url, dest, fallbacks)
        if success:
            downloaded_records.append({
                "dataset": "NAB (AWS CloudWatch)",
                "filename": dest.name,
                "path": dest,
                "size": size,
                "url": final_url,
                "is_csv": dest.name.endswith(".csv")
            })
            # Also create duplicate alias for 77c1ca if 77c1ef was downloaded from 77c1ca
            if "77c1ca" in final_url and dest.name == "ec2_cpu_utilization_77c1ef.csv":
                alt_dest = NAB_DIR / "ec2_cpu_utilization_77c1ca.csv"
                if not alt_dest.exists():
                    shutil.copyfile(str(dest), str(alt_dest))

    # -------------------------------------------------------------------------
    # 2. GOOGLE CLUSTER TRACES & AZURE PUBLIC DATASET
    # -------------------------------------------------------------------------
    logger.log("\n[2/3] Downloading Google Cluster Traces Metadata...")
    google_md_url = "https://raw.githubusercontent.com/google/cluster-data/master/ClusterData2011_2.md"
    google_md_dest = GOOGLE_DIR / "ClusterData2011_2.md"
    success, final_url, size, elapsed = download_file(google_md_url, google_md_dest)
    if success:
        downloaded_records.append({
            "dataset": "Google Cluster Traces",
            "filename": google_md_dest.name,
            "path": google_md_dest,
            "size": size,
            "url": final_url,
            "is_csv": False
        })

    logger.log("\n[3/3] Downloading Azure Public Dataset Traces...")
    # Fetch links file
    azure_links_url = "https://raw.githubusercontent.com/Azure/AzurePublicDataset/master/data/AzurePublicDatasetLinksV2.txt"
    azure_links_fallback = ["https://raw.githubusercontent.com/Azure/AzurePublicDataset/master/AzurePublicDatasetLinksV2.txt"]
    azure_links_dest = AZURE_DIR / "links.txt"

    success, final_url, size, elapsed = download_file(azure_links_url, azure_links_dest, azure_links_fallback)
    if success:
        downloaded_records.append({
            "dataset": "Azure Public Dataset",
            "filename": azure_links_dest.name,
            "path": azure_links_dest,
            "size": size,
            "url": final_url,
            "is_csv": False
        })

        # Parse the links file and extract first 3 .csv or .gz files
        logger.log("\nParsing Azure links.txt to find first 3 .csv / .gz files...")
        with open(azure_links_dest, "r", encoding="utf-8", errors="replace") as f:
            azure_lines = [l.strip() for l in f if l.strip()]

        trace_urls = []
        for line in azure_lines:
            if line.endswith(".csv") or line.endswith(".gz") or line.endswith(".csv.gz"):
                trace_urls.append(line)
                if len(trace_urls) == 3:
                    break

        logger.log(f"Found {len(trace_urls)} target files to download:")
        for idx, u in enumerate(trace_urls, 1):
            logger.log(f"  {idx}. {u.split('/')[-1]} ({u})")

        for trace_url in trace_urls:
            filename = trace_url.split("/")[-1]
            dest = AZURE_DIR / filename
            success, final_url, size, elapsed = download_file(trace_url, dest)
            if success:
                downloaded_records.append({
                    "dataset": "Azure Public Dataset",
                    "filename": dest.name,
                    "path": dest,
                    "size": size,
                    "url": final_url,
                    "is_csv": dest.name.endswith(".csv") or dest.name.endswith(".csv.gz")
                })

    # -------------------------------------------------------------------------
    # 3. PRINT SUMMARY & CSV PREVIEWS
    # -------------------------------------------------------------------------
    logger.log("\n" + "=" * 80)
    logger.log("DOWNLOAD SUMMARY")
    logger.log("=" * 80)

    datasets_grouped = {}
    for rec in downloaded_records:
        dname = rec["dataset"]
        if dname not in datasets_grouped:
            datasets_grouped[dname] = []
        datasets_grouped[dname].append(rec)

    total_files_count = len(downloaded_records)
    total_size_all = sum(r["size"] for r in downloaded_records)

    logger.log(f"\nTotal Files Downloaded: {total_files_count}")
    logger.log(f"Total Cumulative Size:   {format_size(total_size_all)}\n")

    logger.log(f"{'Dataset Group':<28} | {'Files':<6} | {'Total Size':<12}")
    logger.log("-" * 52)
    for dname, recs in datasets_grouped.items():
        grp_size = sum(r["size"] for r in recs)
        logger.log(f"{dname:<28} | {len(recs):<6} | {format_size(grp_size):<12}")

    logger.log("\nDetailed File List:")
    logger.log(f"{'Filename':<50} | {'Size':<12} | {'Dataset':<22}")
    logger.log("-" * 88)
    for rec in downloaded_records:
        logger.log(f"{rec['filename']:<50} | {format_size(rec['size']):<12} | {rec['dataset']:<22}")

    # CSV Previews
    logger.log("\n" + "=" * 80)
    logger.log("CSV DATA PREVIEWS (First 5 Rows of Each CSV / GZ Dataset)")
    logger.log("=" * 80)

    csv_files = [r for r in downloaded_records if r["is_csv"]]
    for idx, rec in enumerate(csv_files, 1):
        logger.log(f"\n[{idx}/{len(csv_files)}] Preview: {rec['filename']} ({rec['dataset']})")
        logger.log("-" * 80)
        lines = preview_file(rec["path"], num_rows=5)
        for line_num, l in enumerate(lines, 1):
            logger.log(f"  Row {line_num}: {l}")

    logger.log("\n" + "=" * 80)
    logger.log(f"Log saved successfully to: {LOG_FILE}")
    logger.log("=" * 80)
    logger.close()


if __name__ == "__main__":
    main()
