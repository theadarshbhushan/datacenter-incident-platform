"""
Reproducible training and evaluation for the VaultWatch disk-failure predictor.

    cd dc-backend
    pip install -r requirements-ml.txt
    python -m app.ml.training.train_disk --data ../dc-ml/datasets/backblaze

Data: the Backblaze Drive Stats quarterly archives for 2024 (data_Q1_2024.zip ... data_Q4_2024.zip,
from https://www.backblaze.com/cloud-storage/resources/hard-drive-test-data). Each row is one drive
on one day, and `failure` is 1 on a drive's last day before it failed. Nothing is synthesized.

Target: the drive fails within the next 30 days. Snapshots are taken weekly, so each row can also use
the change since the previous week. Rows on or after the failure day are dropped.

Splits are disjoint in both time and drives, with a 30-day gap so no label window overlaps:
    train       snapshots to 1 Jul    70% of drives
    validation  1 Aug to 1 Sep        10% of drives (model choice, calibration, thresholds)
    test        2 Oct to 1 Dec        20% of drives (reported once)

Outputs (in app/ml/artifacts/ unless --out is given):
    disk_model.json.gz    portable model (numpy-scored, no pickles) + thresholds + metadata
    disk_evaluation.json  every reported metric, computed by this script
    DISK_MODEL_CARD.md    human summary generated from disk_evaluation.json
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import re
import sys
import time
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.csv as pacsv
import pyarrow.parquet as pq
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

from app.ml import disk_features as D
from app.ml import trees as T

ROOT = Path(__file__).resolve().parents[3]           # dc-backend/
DEFAULT_DATA = ROOT.parent / "dc-ml" / "datasets" / "backblaze"
DEFAULT_OUT = ROOT / "app" / "ml" / "artifacts"
SEED = 42

HORIZON_DAYS = 30
SNAPSHOT_DAYS = 7
SPLITS = {
    "train": (pd.Timestamp("2024-01-01"), pd.Timestamp("2024-07-01")),
    "validation": (pd.Timestamp("2024-08-01"), pd.Timestamp("2024-09-01")),
    "test": (pd.Timestamp("2024-10-02"), pd.Timestamp("2024-12-01")),
}
DRIVE_BUCKETS = {"train": range(0, 7), "validation": range(7, 8), "test": range(8, 10)}
MAX_TRAIN_NEGATIVES = 400_000
WARNING_FPR, CRITICAL_FPR = 0.01, 0.001
SSD_MODELS = re.compile(r"SSD|^CT\d|^Micron|^MTFD|DELLBOSS|^WDC? +WDS|^WD.*SA\d|\bZA\d", re.IGNORECASE)
RAW_COLUMNS = [f"smart_{a}_raw" for a in D.SMART_ATTRS]


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------- 1. load ----------

def daily_csvs(data_dir: Path):
    archives = sorted(data_dir.glob("data_Q*_2024.zip"))
    if len(archives) != 4:
        sys.exit(f"Expected data_Q1_2024.zip to data_Q4_2024.zip in {data_dir}, found {len(archives)}.")
    for path in archives:
        with zipfile.ZipFile(path) as z:
            names = sorted(n for n in z.namelist() if re.search(r"(^|/)\d{4}-\d{2}-\d{2}\.csv$", n) and "__MACOSX" not in n)
            for name in names:
                yield name.rsplit("/", 1)[-1][:-4], z.read(name)


def read_day(raw: bytes, columns: list[str]) -> pa.Table:
    types = {c: pa.float64() for c in RAW_COLUMNS}
    options = pacsv.ConvertOptions(include_columns=columns, include_missing_columns=True, column_types=types)
    return pacsv.read_csv(io.BytesIO(raw), convert_options=options)


def build_cache(data_dir: Path) -> tuple[Path, Path]:
    """One pass over every daily file: failure days from all of them, full rows from each weekly snapshot."""
    snapshots_path, failures_path = data_dir / "snapshots.parquet", data_dir / "failures.parquet"
    if snapshots_path.exists() and failures_path.exists():
        return snapshots_path, failures_path
    first = date(2024, 1, 1)
    columns = ["date", "serial_number", "model", "failure"] + RAW_COLUMNS
    failures, writer, days = [], None, 0
    for day, raw in daily_csvs(data_dir):
        t = read_day(raw, columns)
        days += 1
        failed = t.filter(pc.equal(t["failure"], 1)).select(["serial_number", "model"])
        failures.append(failed.append_column("date", pa.array([day] * failed.num_rows, pa.string())))
        if (date.fromisoformat(day) - first).days % SNAPSHOT_DAYS == 0:
            t = t.drop_columns(["date", "failure"])
            t = t.append_column("date", pa.array([day] * t.num_rows, pa.string()))
            if writer is None:
                writer = pq.ParquetWriter(snapshots_path, t.schema, compression="zstd")
            writer.write_table(t)
            log(f"  {day}: {t.num_rows:,} drives")
    writer.close()
    pq.write_table(pa.concat_tables(failures), failures_path)
    log(f"Read {days} daily files.")
    return snapshots_path, failures_path


def manufacturer(model: str) -> str:
    m = model.upper()
    if m.startswith("ST") or m.startswith("SEAGATE"):
        return "Seagate"
    if m.startswith("TOSHIBA") or m.startswith("MG0"):
        return "Toshiba"
    if m.startswith(("HGST", "HITACHI", "HDS", "HUH", "HUS", "HMS")):
        return "HGST"
    if m.startswith(("WDC", "WD", "WUH")):
        return "Western Digital"
    return "Other"


def load_rows(snapshots_path: Path, failures_path: Path) -> tuple[pd.DataFrame, np.ndarray, dict]:
    df = pd.read_parquet(snapshots_path)
    fails = pd.read_parquet(failures_path)
    total_rows, total_models = len(df), df["model"].nunique()
    models = pd.Series(df["model"].unique())
    hdd = set(models[~models.str.contains(SSD_MODELS)])
    df = df[df["model"].isin(hdd)].copy()
    fails = fails[fails["model"].isin(hdd)]
    df["date"] = pd.to_datetime(df["date"])
    fail_dates = pd.to_datetime(fails.drop_duplicates("serial_number", keep="last").set_index("serial_number")["date"])

    df = df.sort_values(["serial_number", "date"], kind="stable").reset_index(drop=True)
    grouped = df.groupby("serial_number", sort=False)
    before = {}
    for a in D.SMART_ATTRS:
        previous = grouped[f"smart_{a}_raw"].shift(1)
        gap = grouped["date"].diff().dt.days
        before[a] = previous.where(gap <= SNAPSHOT_DAYS * 2).to_numpy(dtype=float)
    now = {a: df[f"smart_{a}_raw"].to_numpy(dtype=float) for a in D.SMART_ATTRS}
    X = D.feature_matrix(now, before).astype(np.float32)

    failure_day = df["serial_number"].map(fail_dates)
    days_left = (failure_day - df["date"]).dt.days
    keep = (days_left.isna() | (days_left > 0)).to_numpy()
    rows = pd.DataFrame({
        "serial": df["serial_number"].to_numpy(), "date": df["date"].to_numpy(), "model": df["model"].to_numpy(),
        "days_left": days_left.to_numpy(), "y": (days_left.between(1, HORIZON_DAYS)).to_numpy(dtype=np.int8),
    })[keep].reset_index(drop=True)
    hashes = pd.util.hash_array(rows["serial"].to_numpy(dtype=object), categorize=True)
    rows["bucket"] = (hashes % 10).astype(np.int8)
    rows["maker"] = rows["model"].map({m: manufacturer(m) for m in hdd})
    meta = {
        "snapshot_rows_all": int(total_rows), "models_all": int(total_models), "hdd_models": len(hdd),
        "ssd_models_excluded": sorted(str(m) for m in set(models) - hdd),
        "drives": int(rows["serial"].nunique()), "failed_drives": int(len(fail_dates)),
    }
    return rows, X[keep], meta


def split_index(rows: pd.DataFrame, name: str) -> np.ndarray:
    lo, hi = SPLITS[name]
    in_time = (rows["date"] >= lo) & (rows["date"] <= hi)
    return np.flatnonzero((in_time & rows["bucket"].isin(list(DRIVE_BUCKETS[name]))).to_numpy())


# ---------- 2. models ----------

def candidates() -> dict:
    return {
        "gradient_boosting": GradientBoostingClassifier(n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=SEED),
        "random_forest": RandomForestClassifier(n_estimators=100, max_depth=10, min_samples_leaf=20, n_jobs=-1, random_state=SEED),
        "logistic_regression": LogisticRegression(max_iter=2000),
    }


def fit_export(name: str, model, X: np.ndarray, y: np.ndarray) -> dict:
    if name == "logistic_regression":
        scaler = StandardScaler().fit(X)
        model.fit(scaler.transform(X), y)
        return T.export_logistic(model, scaler)
    model.fit(X, y)
    return T.export_random_forest(model) if name == "random_forest" else T.export_gradient_boosting(model)


def sklearn_scores(name: str, model, exported: dict, X: np.ndarray) -> np.ndarray:
    if name == "logistic_regression":
        return T.ClassifierScorer(exported).raw(X)
    return model.predict_proba(X)[:, 1]


def expected_calibration_error(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    edges = np.quantile(p, np.linspace(0, 1, bins + 1))
    which = np.clip(np.searchsorted(np.unique(edges), p, side="right") - 1, 0, bins - 1)
    return float(sum(abs(y[which == b].mean() - p[which == b].mean()) * (which == b).mean() for b in np.unique(which)))


# ---------- 3. evaluation ----------

def operating_point(rows: pd.DataFrame, y: np.ndarray, flagged: np.ndarray) -> dict:
    """Row-level precision and recall, plus what an operator sees per drive over the evaluation window."""
    tp, fp = int((flagged & (y == 1)).sum()), int((flagged & (y == 0)).sum())
    drives = pd.DataFrame({"serial": rows["serial"].to_numpy(), "flagged": flagged, "y": y, "days_left": rows["days_left"].to_numpy()})
    per_drive = drives.groupby("serial").agg(flagged=("flagged", "max"), failed=("y", "max"))
    caught = int((per_drive["flagged"] & (per_drive["failed"] == 1)).sum())
    failed = int((per_drive["failed"] == 1).sum())
    false_drives = int((per_drive["flagged"] & (per_drive["failed"] == 0)).sum())
    healthy = int((per_drive["failed"] == 0).sum())
    lead = drives[drives["flagged"] & (drives["y"] == 1)].groupby("serial")["days_left"].max()
    return {
        "precision": round(tp / max(1, tp + fp), 4), "recall": round(tp / max(1, int(y.sum())), 4),
        "false_positive_rate": round(fp / max(1, int((y == 0).sum())), 5),
        "failed_drives": failed, "failed_drives_caught": caught, "drive_recall": round(caught / max(1, failed), 4),
        "healthy_drives": healthy, "healthy_drives_flagged": false_drives, "healthy_flag_rate": round(false_drives / max(1, healthy), 5),
        "drive_precision": round(caught / max(1, caught + false_drives), 4),
        "median_lead_days": None if lead.empty else float(lead.median()),
    }


def threshold_for_fpr(p: np.ndarray, y: np.ndarray, fpr: float) -> float:
    return float(np.quantile(p[y == 0], 1 - fpr))


def evaluate(name: str, rows: pd.DataFrame, X: np.ndarray, scorer: T.ClassifierScorer, thresholds: dict) -> dict:
    y = rows["y"].to_numpy()
    p = scorer.predict_proba(X)
    errors = X[:, D.FEATURE_NAMES.index("error_attrs_nonzero")] > 0
    out = {
        "split": name, "rows": len(y), "positive_rows": int(y.sum()), "base_rate": round(float(y.mean()), 6),
        "pr_auc": round(float(average_precision_score(y, p)), 4), "roc_auc": round(float(roc_auc_score(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 6), "brier_base_rate": round(float(np.mean((y - y.mean()) ** 2)), 6),
        "calibration_error": round(expected_calibration_error(y, p), 6),
        "warning": operating_point(rows, y, p >= thresholds["warning"]),
        "critical": operating_point(rows, y, p >= thresholds["critical"]),
        "baseline_any_error_counter": operating_point(rows, y, errors),
        "by_manufacturer": {},
    }
    out["baseline_any_error_counter"]["pr_auc"] = round(float(average_precision_score(y, X[:, D.FEATURE_NAMES.index("error_attrs_nonzero")])), 4)
    for maker, part in rows.groupby("maker"):
        ix = part.index.to_numpy()
        if y[ix].sum() >= 5:
            out["by_manufacturer"][maker] = {"positive_rows": int(y[ix].sum()), "pr_auc": round(float(average_precision_score(y[ix], p[ix])), 4),
                                             **{k: v for k, v in operating_point(part, y[ix], p[ix] >= thresholds["warning"]).items() if k in ("failed_drives", "failed_drives_caught", "healthy_flag_rate")}}
    return out


def leave_one_maker_out(name: str, rows: pd.DataFrame, X: np.ndarray, train: np.ndarray, test: np.ndarray) -> dict:
    """Does the model carry over to a vendor it never saw? Fit without one maker, score only that maker."""
    out = {}
    rng = np.random.default_rng(SEED)
    for maker in sorted(rows["maker"].iloc[test].unique()):
        fit_ix = train[(rows["maker"].iloc[train] != maker).to_numpy()]
        y_fit = rows["y"].to_numpy()[fit_ix]
        fit_ix = np.concatenate([fit_ix[y_fit == 1], rng.permutation(fit_ix[y_fit == 0])[:100_000]])
        eval_ix = test[(rows["maker"].iloc[test] == maker).to_numpy()]
        y_eval = rows["y"].to_numpy()[eval_ix]
        if y_eval.sum() < 5:
            continue
        model = candidates()[name]
        exported = fit_export(name, model, X[fit_ix], rows["y"].to_numpy()[fit_ix])
        out[maker] = {"positive_rows": int(y_eval.sum()), "base_rate": round(float(y_eval.mean()), 6),
                      "pr_auc": round(float(average_precision_score(y_eval, T.ClassifierScorer(exported).raw(X[eval_ix]))), 4)}
    return out


# ---------- 4. model card ----------

def model_card(ev: dict) -> str:
    t, w, c, b = ev["test"], ev["test"]["warning"], ev["test"]["critical"], ev["test"]["baseline_any_error_counter"]
    row = lambda n, r: f"| {n} | {r['precision']} | {r['recall']} | {r['failed_drives_caught']} of {r['failed_drives']} | {r['healthy_drives_flagged']} of {r['healthy_drives']} | {r['median_lead_days']} |"  # noqa: E731
    lines = [
        f"# VaultWatch disk failure model card: {ev['model_version']}", "",
        f"Generated by `python -m app.ml.training.train_disk` on {ev['trained_at']}. Every number below comes from `disk_evaluation.json`.", "",
        "## Data", "",
        f"- Backblaze Drive Stats, all of 2024: {ev['data']['drives']:,} hard drives, {ev['data']['hdd_models']} models, {ev['data']['failed_drives']:,} recorded failures. Weekly snapshots of SMART attributes {', '.join(str(a) for a in D.SMART_ATTRS)}.",
        "- Source: Backblaze Drive Stats (https://www.backblaze.com/cloud-storage/resources/hard-drive-test-data). The data itself is not redistributed here.",
        "- Labels are real drive failures recorded by Backblaze. Nothing is synthesized.",
        f"- {len(ev['data']['ssd_models_excluded'])} SSD and boot-drive models were excluded.", "",
        "## Target", "",
        f"The drive fails within the next {HORIZON_DAYS} days. Train, validation and test are disjoint in time and in drives, with gaps longer than the {HORIZON_DAYS}-day label window.", "",
        "## Results on the held-out test split", "",
        f"Selected model: {ev['selected_model']} (by validation PR-AUC). {t['rows']:,} rows, {t['positive_rows']:,} positive, base rate {t['base_rate']}.", "",
        f"- PR-AUC {t['pr_auc']} (rule baseline {b['pr_auc']}), ROC-AUC {t['roc_auc']}.",
        f"- Brier score {t['brier']} vs {t['brier_base_rate']} for always predicting the base rate. Calibration error {t['calibration_error']}.",
        f"- Probabilities are shown as calibrated: **{'yes' if ev['probability_is_calibrated'] else 'no'}** (requires positive Brier skill and calibration error below half the base rate on the test split).", "",
        "| Detector | Precision (rows) | Recall (rows) | Failed drives caught | Healthy drives flagged | Median lead (days) |",
        "| --- | --- | --- | --- | --- | --- |",
        row(f"Warning ({WARNING_FPR:.1%} FPR on validation)", w), row(f"Critical ({CRITICAL_FPR:.1%} FPR on validation)", c), row("Rule: any error counter above zero", b), "",
        "Leave-one-manufacturer-out PR-AUC (trained without that maker, tested only on it):", "",
        "| Maker | PR-AUC | Base rate |", "| --- | --- | --- |",
    ]
    lines += [f"| {m} | {v['pr_auc']} | {v['base_rate']} |" for m, v in ev["leave_one_maker_out"].items()]
    lines += [
        "", "## Limitations", "",
        "- **Experimental.** Most flagged drives did not fail in the test window, so VaultWatch raises a warning alert at the critical level and never opens an incident from this model.",
        f"- Selection was noisy: validation had only {ev['validation_positive_rows']} positive rows, and test PR-AUC ({t['pr_auc']}) came in below the selected model's validation PR-AUC ({ev['validation_pr_auc'][ev['selected_model']]}). The test false-positive rate was also above the rate the thresholds were set for, so expect drift.",
        "- Results depend on the maker. See the leave-one-manufacturer-out table: the model carried over poorly to Seagate drives when it had not trained on them.",
        "- SATA hard drives only. NVMe drives and other SSDs report different health data and are not scored.",
        "- Backblaze runs drives in a data center at steady load and temperature. Other environments may behave differently.",
        "- Most failures show no warning in these SMART attributes, so a healthy score does not mean a drive is safe. Keep backups and RAID.",
        "- Drives leaving the fleet for other reasons count as not failed.",
        "- Memory, power supply, fan, CPU and overheating failures are not predicted.", "",
        "## Retraining", "", "```bash", "cd dc-backend", "pip install -r requirements-ml.txt",
        "# put data_Q1_2024.zip to data_Q4_2024.zip in ../dc-ml/datasets/backblaze", "python -m app.ml.training.train_disk", "```", "",
        "Restart the API afterwards; it loads `app/ml/artifacts/disk_model.json.gz` once at startup.", "",
    ]
    return "\n".join(lines)


# ---------- main ----------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    started = time.time()

    log("1. Reading the daily files")
    snapshots, failures = build_cache(args.data)
    rows, X, meta = load_rows(snapshots, failures)
    log(f"   {meta}".replace(str(meta["ssd_models_excluded"]), f"[{len(meta['ssd_models_excluded'])} models]"))
    ix = {name: split_index(rows, name) for name in SPLITS}
    y = rows["y"].to_numpy()
    for name, i in ix.items():
        log(f"   {name}: {len(i):,} rows, {int(y[i].sum()):,} positive")

    log("2. Fitting candidates")
    rng = np.random.default_rng(SEED)
    train = ix["train"]
    positives, negatives = train[y[train] == 1], train[y[train] == 0]
    fit_ix = np.concatenate([positives, rng.permutation(negatives)[:MAX_TRAIN_NEGATIVES]])
    val = ix["validation"]
    fitted, results = {}, {}
    for name, model in candidates().items():
        t0 = time.time()
        exported = fit_export(name, model, X[fit_ix], y[fit_ix])
        scorer = T.ClassifierScorer(exported)
        check = rng.choice(val, size=min(20_000, len(val)), replace=False)
        worst = float(np.abs(scorer.raw(X[check]) - sklearn_scores(name, model, exported, X[check])).max())
        if worst > 1e-9:
            sys.exit(f"Exported {name} does not reproduce scikit-learn (largest difference {worst}).")
        results[name] = round(float(average_precision_score(y[val], scorer.raw(X[val]))), 4)
        fitted[name] = exported
        log(f"   {name}: validation PR-AUC {results[name]} ({time.time() - t0:.0f}s)")
    selected = max(results, key=results.get)

    log(f"3. Calibrating {selected} and setting thresholds on validation")
    raw_val = T.ClassifierScorer(fitted[selected]).raw(X[val])
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(raw_val, y[val])
    calibration = {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()}
    scorer = T.ClassifierScorer(fitted[selected], calibration)
    p_val = scorer.predict_proba(X[val])
    thresholds = {"warning": threshold_for_fpr(p_val, y[val], WARNING_FPR), "critical": threshold_for_fpr(p_val, y[val], CRITICAL_FPR)}
    if thresholds["warning"] <= 0:
        thresholds["warning"] = float(p_val[p_val > 0].min())
    log(f"   thresholds {thresholds}")

    log("4. Evaluating once on the test split")
    test_rows, X_test = rows.iloc[ix["test"]].reset_index(drop=True), X[ix["test"]]
    test = evaluate("test", test_rows, X_test, scorer, thresholds)
    log(json.dumps({k: v for k, v in test.items() if k != "by_manufacturer"}, indent=1))
    log("5. Leave-one-manufacturer-out")
    lomo = leave_one_maker_out(selected, rows, X, train, ix["test"])
    log(json.dumps(lomo))

    brier_skill = 1 - test["brier"] / test["brier_base_rate"]
    calibrated = bool(brier_skill > 0 and test["calibration_error"] < test["base_rate"] / 2)
    trained_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    fingerprint = hashlib.sha256(json.dumps([meta["drives"], meta["failed_drives"], meta["snapshot_rows_all"]]).encode()).hexdigest()[:6]
    version = f"vw-disk-{trained_at[:10].replace('-', '')}-{fingerprint}"
    summary = {
        "test_pr_auc": test["pr_auc"], "test_base_rate": test["base_rate"], "failed_drives": test["warning"]["failed_drives"],
        "failed_drives_caught_warning": test["warning"]["failed_drives_caught"], "failed_drives_caught_critical": test["critical"]["failed_drives_caught"],
        "healthy_flag_rate_warning": test["warning"]["healthy_flag_rate"], "healthy_flag_rate_critical": test["critical"]["healthy_flag_rate"],
    }
    bundle = {
        "format": "vaultwatch-disk-model/1", "model_version": version, "trained_at": trained_at, "horizon_days": HORIZON_DAYS,
        "smart_attrs": list(D.SMART_ATTRS), "features": list(D.FEATURE_NAMES), "model": fitted[selected], "calibration": calibration,
        "thresholds": thresholds, "probability_is_calibrated": calibrated, "summary": summary,
    }
    evaluation = {
        "model_version": version, "trained_at": trained_at, "data": meta, "splits": {k: [str(a.date()), str(b.date())] for k, (a, b) in SPLITS.items()},
        "horizon_days": HORIZON_DAYS, "validation_pr_auc": results, "selected_model": selected, "thresholds": thresholds,
        "probability_is_calibrated": calibrated, "brier_skill": round(brier_skill, 4), "validation_positive_rows": int(y[val].sum()), "test": test, "leave_one_maker_out": lomo,
        "versions": {"scikit-learn": __import__("sklearn").__version__, "pandas": pd.__version__, "numpy": np.__version__},
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "disk_model.json.gz").write_bytes(gzip.compress(json.dumps(bundle).encode("utf-8"), mtime=0))
    (args.out / "disk_evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")
    (args.out / "DISK_MODEL_CARD.md").write_text(model_card(evaluation), encoding="utf-8")
    log(f"Wrote {version} to {args.out} in {(time.time() - started) / 60:.1f} minutes.")


if __name__ == "__main__":
    main()
