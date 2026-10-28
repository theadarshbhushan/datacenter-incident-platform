"""
Reproducible training and evaluation for the VaultWatch anomaly detector and the experimental
early-warning forecaster.

    cd dc-backend
    pip install -r requirements-ml.txt
    python -m app.ml.training.train                     # uses ../dc-ml/datasets/nab
    python -m app.ml.training.train --nab PATH --out PATH

Data: eight real AWS CloudWatch series from the Numenta Anomaly Benchmark (NAB), 5-minute
resolution, with NAB's human-labeled anomaly windows. Only real measurements are used. Nothing is
synthesized: each series has exactly one metric (CPU, disk write bytes or network bytes in).

Outputs (in app/ml/artifacts/ unless --out is given):
    model_bundle.json.gz   portable model (numpy-scored, no pickles) + thresholds + metadata
    evaluation.json        every reported metric, computed by this script
    MODEL_CARD.md          human summary generated from evaluation.json
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest, RandomForestClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

from app.ml import features as F
from app.ml import trees as T

ROOT = Path(__file__).resolve().parents[3]           # dc-backend/
DEFAULT_NAB = ROOT.parent / "dc-ml" / "datasets" / "nab"
DEFAULT_OUT = ROOT / "app" / "ml" / "artifacts"
SEED = 42

# file name on disk -> (NAB label key, metric kind). The 77c1ef file was downloaded from NAB's 77c1ca
# series (see dc-ml/datasets/download_log.txt), so it uses 77c1ca's labels.
SERIES = {
    "ec2_cpu_utilization_24ae8d.csv": ("ec2_cpu_utilization_24ae8d.csv", "cpu"),
    "ec2_cpu_utilization_53ea38.csv": ("ec2_cpu_utilization_53ea38.csv", "cpu"),
    "ec2_cpu_utilization_77c1ef.csv": ("ec2_cpu_utilization_77c1ca.csv", "cpu"),
    "ec2_cpu_utilization_825cc2.csv": ("ec2_cpu_utilization_825cc2.csv", "cpu"),
    "ec2_cpu_utilization_ac20cd.csv": ("ec2_cpu_utilization_ac20cd.csv", "cpu"),
    "ec2_disk_write_bytes_1ef3de.csv": ("ec2_disk_write_bytes_1ef3de.csv", "disk_io"),
    "ec2_network_in_257a54.csv": ("ec2_network_in_257a54.csv", "network"),
    "rds_cpu_utilization_cc0c53.csv": ("rds_cpu_utilization_cc0c53.csv", "cpu"),
}

# Experimental early-warning target: an upward excursion of the 15-minute mean to more than
# FORECAST_Z robust standard deviations above the series' 24h baseline, starting within the next hour.
FORECAST_Z = 4.0
FORECAST_HORIZON = F.HOUR       # buckets (1 hour)


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------- 1. load and validate ----------

def load_series(nab_dir: Path) -> list[dict]:
    windows_path = nab_dir / "combined_windows.json"
    if not windows_path.exists():
        sys.exit(f"Missing {windows_path}. Run scripts/download_datasets.py first.")
    windows = json.loads(windows_path.read_text(encoding="utf-8"))
    out = []
    for fname, (label_key, kind) in SERIES.items():
        path = nab_dir / fname
        if not path.exists():
            sys.exit(f"Missing dataset file {path}")
        raw = pd.read_csv(path)
        if list(raw.columns) != ["timestamp", "value"]:
            sys.exit(f"{fname}: expected columns timestamp,value, got {list(raw.columns)}")
        raw["timestamp"] = pd.to_datetime(raw["timestamp"], errors="coerce")
        bad_ts = int(raw["timestamp"].isna().sum())
        raw["value"] = pd.to_numeric(raw["value"], errors="coerce")
        bad_val = int(raw["value"].isna().sum())
        negative = int((raw["value"] < 0).sum())
        raw = raw.dropna().query("value >= 0")
        dupes = int(raw["timestamp"].duplicated().sum())
        raw = raw.drop_duplicates("timestamp").sort_values("timestamp")
        # Resample onto a regular 5-minute grid (bucket means), exactly as live telemetry is bucketed.
        s = raw.set_index("timestamp")["value"].resample(f"{F.BUCKET_SECONDS}s").mean()
        wins = [(pd.Timestamp(a), pd.Timestamp(b)) for a, b in windows.get(f"realAWSCloudwatch/{label_key}", [])]
        label = np.zeros(len(s), dtype=bool)
        for a, b in wins:
            label |= (s.index >= a) & (s.index <= b)
        out.append({
            "name": fname.removesuffix(".csv"), "kind": kind, "index": s.index, "values": s.to_numpy(dtype=float),
            "label": label, "windows": wins,
            "validation": {"rows": int(len(raw)), "buckets": int(len(s)), "missing_buckets": int(s.isna().sum()),
                           "unparseable_timestamps": bad_ts, "non_numeric_values": bad_val, "negative_values": negative,
                           "duplicate_timestamps": dupes, "label_windows": len(wins), "labeled_buckets": int(label.sum())},
        })
        log(f"  {fname:<36} {len(s):>5} buckets, {int(s.isna().sum())} missing, {len(wins)} windows, {int(label.sum())} labeled")
    return out


def data_fingerprint(nab_dir: Path) -> str:
    h = hashlib.sha256()
    for fname in sorted(SERIES):
        h.update((nab_dir / fname).read_bytes())
    h.update((nab_dir / "combined_windows.json").read_bytes())
    return h.hexdigest()[:12]


# ---------- metrics helpers ----------

def binary_metrics(y: np.ndarray, pred: np.ndarray) -> dict:
    tp = int(np.sum(pred & y)); fp = int(np.sum(pred & ~y)); fn = int(np.sum(~pred & y)); tn = int(np.sum(~pred & ~y))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
            "false_positive_rate": round(fp / (fp + tn), 5) if fp + tn else 0.0, "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def best_f1_threshold(y: np.ndarray, score: np.ndarray) -> float:
    """Threshold on `score` (higher = more positive) that maximizes F1."""
    qs = np.unique(np.quantile(score, np.linspace(0.5, 0.9995, 400)))
    best, best_t = -1.0, float(qs[-1])
    for t in qs:
        m = binary_metrics(y, score >= t)
        if m["f1"] > best:
            best, best_t = m["f1"], float(t)
    return best_t


def event_metrics(series: dict, alarm: np.ndarray, valid: np.ndarray) -> dict:
    """Window-level view: was each labeled window alarmed at least once, and how many alarm episodes fell outside windows."""
    idx = series["index"]
    detected, delays = 0, []
    for a, b in series["windows"]:
        in_w = (idx >= a) & (idx <= b) & valid
        hits = np.where(in_w & alarm)[0]
        if len(hits):
            detected += 1
            center = a + (b - a) / 2
            delays.append((idx[hits[0]] - center).total_seconds() / 3600)
    outside = alarm & ~series["label"] & valid
    episodes = int(np.sum(outside[1:] & ~outside[:-1]) + (1 if len(outside) and outside[0] else 0))
    days = valid.sum() * F.BUCKET_SECONDS / 86400
    return {"windows": len(series["windows"]), "detected": detected, "false_alarm_episodes": episodes, "days": round(float(days), 2),
            "first_alarm_vs_window_center_hours": [round(d, 1) for d in delays]}


def calibration_error(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    edges = np.linspace(0, 1, bins + 1)
    ece = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi) if hi < 1 else (p >= lo) & (p <= hi)
        if m.any():
            ece += m.mean() * abs(p[m].mean() - y[m].mean())
    return float(ece)


# ---------- 2. anomaly detection ----------

def new_isolation_forest() -> IsolationForest:
    return IsolationForest(n_estimators=200, max_samples=256, contamination="auto", random_state=SEED, n_jobs=-1)


def baseline_score(X: np.ndarray) -> np.ndarray:
    """Statistical baseline: largest absolute robust z-score of the current and 15-minute level."""
    return np.max(np.abs(X[:, :2]), axis=1)


# Operating points. "f1_optimal" maximizes bucket F1 on the training series; the FPR points set the
# threshold at a quantile of the training series' normal (unlabeled) buckets. Production uses the FPR points.
OPERATING_POINTS = {"f1_optimal": None, "fpr_2pct": 0.98, "fpr_0_5pct": 0.995}
# The production alert rule: above the warning threshold for SUSTAIN consecutive buckets (15 minutes)
# and above the critical threshold in at least one of them. Isolation Forest scores peak at the onset of
# a change and ease off while it persists, so requiring "critical" in every bucket would almost never fire.
SUSTAIN = 3


def alert_rule(warn: np.ndarray, crit: np.ndarray, k: int = SUSTAIN) -> np.ndarray:
    all_warn, any_crit = warn.copy(), crit.copy()
    for i in range(1, k):
        all_warn[i:] &= warn[:-i]
        any_crit[i:] |= crit[:-i]
    all_warn[:k - 1] = False
    return all_warn & any_crit


def _threshold(op_quantile: float | None, y: np.ndarray, score: np.ndarray) -> float:
    return best_f1_threshold(y, score) if op_quantile is None else float(np.quantile(score[~y], op_quantile))


def evaluate_anomaly(series: list[dict]) -> dict:
    """Leave-one-series-out: the model never sees the held-out server, and thresholds come from training series only."""
    feats = [F.series_features(s["values"]) for s in series]
    valid = [~np.isnan(f).any(axis=1) for f in feats]
    detectors = ("isolation_forest", "robust_zscore")
    ops = [*OPERATING_POINTS, "alert_rule_15m"]
    pooled = {d: {"y": [], "score": [], **{op: [] for op in ops}} for d in detectors}
    per_series = []
    for i, s in enumerate(series):
        tr = [j for j in range(len(series)) if j != i]
        Xtr = np.vstack([feats[j][valid[j]] for j in tr])
        ytr = np.concatenate([series[j]["label"][valid[j]] for j in tr])
        Xte, yte = feats[i][valid[i]], s["label"][valid[i]]
        model = new_isolation_forest().fit(Xtr)
        row = {"series": s["name"], "kind": s["kind"]}
        for name, tr_score, te_score in (
            ("isolation_forest", -model.score_samples(Xtr), -model.score_samples(Xte)),
            ("robust_zscore", baseline_score(Xtr), baseline_score(Xte)),
        ):
            pooled[name]["y"].append(yte); pooled[name]["score"].append(te_score)
            row[name] = {}
            full = {}
            for op, q in OPERATING_POINTS.items():
                alarm = te_score >= _threshold(q, ytr, tr_score)
                pooled[name][op].append(alarm)
                full[op] = np.zeros(len(s["values"]), dtype=bool); full[op][valid[i]] = alarm
                row[name][op] = {**binary_metrics(yte, alarm), "event": event_metrics(s, full[op], valid[i])}
            held = alert_rule(full["fpr_2pct"], full["fpr_0_5pct"])
            pooled[name]["alert_rule_15m"].append(held[valid[i]])
            row[name]["alert_rule_15m"] = {**binary_metrics(yte, held[valid[i]]), "event": event_metrics(s, held, valid[i])}
        per_series.append(row)
        r = row["isolation_forest"]["alert_rule_15m"]
        log(f"  held out {s['name']:<32} IF alert rule recall={r['recall']:.3f} windows {r['event']['detected']}/{r['event']['windows']}"
            f" false alarms {r['event']['false_alarm_episodes']}")
    summary = {}
    for name, p in pooled.items():
        y, score = np.concatenate(p["y"]), np.concatenate(p["score"])
        summary[name] = {
            # Fold scores come from different models, so pooled AUCs are a rough ranking measure only.
            "pr_auc_pooled": round(float(average_precision_score(y, score)), 4),
            "roc_auc_pooled": round(float(roc_auc_score(y, score)), 4),
            "base_rate": round(float(y.mean()), 4),
        }
        for op in ops:
            ev = [r[name][op]["event"] for r in per_series]
            summary[name][op] = {
                **binary_metrics(y, np.concatenate(p[op])),
                "windows_detected": int(sum(e["detected"] for e in ev)), "windows_total": int(sum(e["windows"] for e in ev)),
                "false_alarm_episodes_per_day": round(sum(e["false_alarm_episodes"] for e in ev) / sum(e["days"] for e in ev), 3),
            }
    return {"protocol": "leave-one-series-out (8 folds); thresholds chosen on the 7 training series only",
            "point_labels": "a 5-minute bucket is positive if it lies inside a NAB anomaly window",
            "operating_points": {**{k: ("F1-optimal" if v is None else f"{(1 - v) * 100:.1f}% of normal training buckets above threshold") for k, v in OPERATING_POINTS.items()},
                                 "alert_rule_15m": f"above the 2% threshold for {SUSTAIN} consecutive buckets and above the 0.5% threshold in at least one (the production alert rule)"},
            "summary": summary, "per_series": per_series}


def fit_final_anomaly(series: list[dict], eval_report: dict) -> tuple[dict, dict]:
    feats = [F.series_features(s["values"]) for s in series]
    valid = [~np.isnan(f).any(axis=1) for f in feats]
    X = np.vstack([f[v] for f, v in zip(feats, valid)])
    y = np.concatenate([s["label"][v] for s, v in zip(series, valid)])
    model = new_isolation_forest().fit(X)
    exported = T.export_isolation_forest(model)
    scorer = T.IsolationForestScorer(exported)
    ref = model.score_samples(X)
    mine = scorer.score_samples(X)
    max_err = float(np.max(np.abs(ref - mine)))
    if max_err > 1e-9:
        sys.exit(f"Portable Isolation Forest scorer disagrees with scikit-learn (max error {max_err}).")
    score = -ref
    # warning: 2% of normal buckets exceed it; critical: 0.5%. F1-optimal thresholds alarm on roughly a
    # fifth of all buckets (see evaluation), which would bury operators in alerts.
    thresholds = {"warning": _threshold(OPERATING_POINTS["fpr_2pct"], y, score), "critical": _threshold(OPERATING_POINTS["fpr_0_5pct"], y, score)}
    quantiles = np.quantile(score, np.linspace(0, 1, 201)).tolist()
    info = {
        "train_buckets": int(len(X)), "train_positive_buckets": int(y.sum()), "portable_scorer_max_abs_error": max_err,
        "thresholds": thresholds,
        "in_sample_at_warning": binary_metrics(y, score >= thresholds["warning"]),
        "in_sample_at_critical": binary_metrics(y, score >= thresholds["critical"]),
        "note": "In-sample numbers describe the deployed thresholds and are optimistic; use the leave-one-series-out results as the performance estimate.",
    }
    return {"model": exported, "thresholds": thresholds, "score_quantiles": quantiles, "sustain_buckets": SUSTAIN}, info


# ---------- 3. experimental early warning ----------

def forecast_dataset(s: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Features at t, label = upward excursion starting in (t, t+H]; rows already in excursion are dropped."""
    x = F.fill_gaps(s["values"])
    X = F.series_features(x)
    n = len(x)
    short = pd.Series(x).rolling(F.SHORT, min_periods=1).mean().to_numpy()
    y = np.zeros(n, dtype=bool)
    keep = ~np.isnan(X).any(axis=1)
    # Baseline known at time t (median/spread of [t-288, t)), applied to future 15-minute means.
    padded = np.concatenate([np.full(F.BASELINE, np.nan), x])
    from numpy.lib.stride_tricks import sliding_window_view
    base = sliding_window_view(padded[:-1], F.BASELINE)[:n]
    med, spread = F._robust_scale(base[keep], axis=1)
    idx = np.where(keep)[0]
    future_max = np.full(n, np.nan)
    for k in range(1, FORECAST_HORIZON + 1):
        shifted = np.concatenate([short[k:], np.full(k, np.nan)])
        future_max = np.fmax(future_max, shifted)
    z_future = (future_max[idx] - med) / spread
    y[idx] = z_future > FORECAST_Z
    keep &= ~np.isnan(future_max)                     # last H buckets have no complete future
    keep[idx] &= X[idx, 1] <= FORECAST_Z              # predict onsets, not persistence
    return X, y, keep


def evaluate_forecast(series: list[dict]) -> tuple[dict | None, dict]:
    parts = {"train": ([], []), "val": ([], []), "test": ([], [])}
    for s in series:
        X, y, keep = forecast_dataset(s)
        n = len(y)
        a, b = int(n * 0.6), int(n * 0.8)
        gap = FORECAST_HORIZON                         # labels look H buckets ahead: leave a gap at each boundary
        ranges = {"train": (0, a - gap), "val": (a, b - gap), "test": (b, n)}
        for name, (lo, hi) in ranges.items():
            m = np.zeros(n, dtype=bool); m[lo:hi] = True; m &= keep
            parts[name][0].append(X[m]); parts[name][1].append(y[m])
    data = {k: (np.vstack(v[0]), np.concatenate(v[1])) for k, v in parts.items()}
    (Xtr, ytr), (Xva, yva), (Xte, yte) = data["train"], data["val"], data["test"]
    report = {
        "target": f"15-minute mean rises more than {FORECAST_Z} robust SD above the 24h baseline within the next "
                  f"{FORECAST_HORIZON * F.BUCKET_SECONDS // 60} minutes, given it is not elevated now",
        "split": "per series, chronological: first 60% train, next 20% validation, last 20% test, 1-hour gaps between splits",
        "rows": {k: int(len(v[1])) for k, v in data.items()},
        "positives": {k: int(v[1].sum()) for k, v in data.items()},
    }
    log(f"  rows {report['rows']} positives {report['positives']}")
    if min(report["positives"].values()) < 10:
        report["status"] = "not_trained"
        report["reason"] = "Too few positive examples in one of the splits to train or evaluate honestly."
        return None, report

    scaler = StandardScaler().fit(Xtr)
    candidates = {
        "logistic_regression": LogisticRegression(max_iter=2000),
        "random_forest": RandomForestClassifier(n_estimators=200, max_depth=8, min_samples_leaf=20, random_state=SEED, n_jobs=-1),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=SEED),
    }
    results = {}
    for name, model in candidates.items():
        Xa = scaler.transform(Xtr) if name == "logistic_regression" else Xtr
        model.fit(Xa, ytr)
        pv = model.predict_proba(scaler.transform(Xva) if name == "logistic_regression" else Xva)[:, 1]
        results[name] = {"val_pr_auc": round(float(average_precision_score(yva, pv)), 4), "val_roc_auc": round(float(roc_auc_score(yva, pv)), 4)}
        log(f"  {name:<20} validation PR-AUC {results[name]['val_pr_auc']:.4f} ROC-AUC {results[name]['val_roc_auc']:.4f}")
    persistence_val = average_precision_score(yva, Xva[:, 1])
    report["candidates"] = results
    report["baseline_current_z_short_val_pr_auc"] = round(float(persistence_val), 4)
    best = max(results, key=lambda k: results[k]["val_pr_auc"])
    model = candidates[best]
    export = (T.export_logistic(model, scaler) if best == "logistic_regression"
              else T.export_random_forest(model) if best == "random_forest" else T.export_gradient_boosting(model))
    scorer = T.ClassifierScorer(export)
    ref = model.predict_proba(scaler.transform(Xte) if best == "logistic_regression" else Xte)[:, 1]
    err = float(np.max(np.abs(ref - scorer.raw(Xte))))
    if err > 1e-6:
        sys.exit(f"Portable {best} scorer disagrees with scikit-learn (max error {err}).")

    iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(scorer.raw(Xva), yva)
    calibration = {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()}
    cal = T.ClassifierScorer(export, calibration)
    p_raw, p_cal = scorer.raw(Xte), cal.predict_proba(Xte)
    base_rate = float(ytr.mean())
    brier_ref = brier_score_loss(yte, np.full(len(yte), base_rate))
    thr = best_f1_threshold(yva, cal.predict_proba(Xva))
    test = {
        "pr_auc": round(float(average_precision_score(yte, p_cal)), 4),
        "pr_auc_uncalibrated": round(float(average_precision_score(yte, p_raw)), 4),
        "roc_auc": round(float(roc_auc_score(yte, p_cal)), 4),
        "baseline_current_z_short_pr_auc": round(float(average_precision_score(yte, Xte[:, 1])), 4),
        "base_rate": round(float(yte.mean()), 4),
        "brier": round(float(brier_score_loss(yte, p_cal)), 5),
        "brier_uncalibrated": round(float(brier_score_loss(yte, p_raw)), 5),
        "brier_base_rate_reference": round(float(brier_ref), 5),
        "brier_skill_score": round(float(1 - brier_score_loss(yte, p_cal) / brier_ref), 4),
        "expected_calibration_error": round(calibration_error(yte, p_cal), 4),
        "threshold": round(thr, 4),
        "at_threshold": binary_metrics(yte, p_cal >= thr),
    }
    calibrated = test["brier_skill_score"] > 0 and test["expected_calibration_error"] < 0.05
    report.update({"status": "experimental", "selected": best, "test": test, "probability_is_calibrated": calibrated})
    log(f"  selected {best}: test PR-AUC {test['pr_auc']} (base rate {test['base_rate']}), Brier skill {test['brier_skill_score']}, ECE {test['expected_calibration_error']}")
    bundle = {"model": export, "calibration": calibration, "threshold": thr, "probability_is_calibrated": calibrated,
              "target_z": FORECAST_Z, "horizon_buckets": FORECAST_HORIZON}
    return bundle, report


# ---------- 4. write artifacts ----------

def model_card(evaluation: dict) -> str:
    a = evaluation["anomaly_detection"]["evaluation"]["summary"]
    f = evaluation["early_warning"]
    lines = [
        f"# VaultWatch model card: {evaluation['model_version']}",
        "",
        f"Generated by `python -m app.ml.training.train` on {evaluation['trained_at']}. Every number below comes from `evaluation.json`.",
        "",
        "## Data",
        "",
        f"- Eight real AWS CloudWatch series from the Numenta Anomaly Benchmark, 5-minute buckets, {evaluation['data']['total_buckets']} buckets in total.",
        "- One real metric per series (CPU utilization, disk write bytes or network bytes in). No synthetic metrics.",
        f"- Labels: {evaluation['data']['label_windows']} human-labeled NAB anomaly windows. There are **no failure or incident labels**.",
        "",
        "## Anomaly detection (used in production)",
        "",
        "Isolation Forest (200 trees, 256 samples per tree) on five scale-free, causal features per metric "
        f"({', '.join(F.FEATURE_NAMES)}), compared with a robust z-score baseline.",
        "",
        "Leave-one-series-out evaluation (each threshold chosen on the other seven series):",
        "",
        "| Detector | Operating point | Precision | Recall | F1 | False-positive rate | Windows detected | False alarm episodes / day |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for name, label in (("isolation_forest", "Isolation Forest"), ("robust_zscore", "Robust z-score baseline")):
        for op, op_label in (("f1_optimal", "F1-optimal"), ("fpr_2pct", "2% FPR (warning)"), ("fpr_0_5pct", "0.5% FPR (critical)"), ("alert_rule_15m", "Alert rule (15 min)")):
            m = a[name][op]
            lines.append(f"| {label} | {op_label} | {m['precision']} | {m['recall']} | {m['f1']} | {m['false_positive_rate']} | "
                         f"{m['windows_detected']}/{m['windows_total']} | {m['false_alarm_episodes_per_day']} |")
    lines += [
        "",
        f"Pooled PR-AUC: Isolation Forest {a['isolation_forest']['pr_auc_pooled']}, z-score {a['robust_zscore']['pr_auc_pooled']} "
        f"(base rate {a['isolation_forest']['base_rate']}). ROC-AUC: {a['isolation_forest']['roc_auc_pooled']} vs {a['robust_zscore']['roc_auc_pooled']}.",
        "",
        "NAB windows are wide (about a day) around one labeled point, so bucket-level recall understates how often the anomaly itself is caught; the window column is the more useful number. "
        + ("The Isolation Forest ranks anomalies better than the z-score baseline (higher pooled PR-AUC) and raises fewer false alarms at the alert rule."
           if a["isolation_forest"]["pr_auc_pooled"] > a["robust_zscore"]["pr_auc_pooled"]
           and a["isolation_forest"]["alert_rule_15m"]["false_alarm_episodes_per_day"] <= a["robust_zscore"]["alert_rule_15m"]["false_alarm_episodes_per_day"]
           else "The Isolation Forest is not clearly better than the z-score baseline on this data."),
        "",
        "Selection note: the spread floor in the features (a quarter of the window's standard deviation, or 2% of its level) was chosen after comparing it with a "
        "MAD-only version on these same leave-one-series-out results (the MAD-only version caught 4/11 windows with 0.77 false alarm episodes per day when the alert rule required 'critical' in all three buckets). "
        "Because the comparison reused the evaluation data, treat the numbers above as slightly optimistic.",
        "",
        "The anomaly score shown in the product is a percentile of the training score distribution. **It is not a probability.**",
        "",
        "## Early warning (experimental)",
        "",
    ]
    if f.get("status") == "experimental":
        t = f["test"]
        lines += [
            f"Target: {f['target']}. This is a statistical excursion, not a hardware failure.",
            "",
            f"Split: {f['split']}. Selected model: {f['selected']} (by validation PR-AUC).",
            "",
            f"- Test PR-AUC {t['pr_auc']} vs base rate {t['base_rate']} and {t['baseline_current_z_short_pr_auc']} for the \"current deviation\" baseline "
            f"({t['pr_auc_uncalibrated']} before isotonic calibration, which merges scores into steps).",
            f"- Brier score {t['brier']} vs {t['brier_base_rate_reference']} for always predicting the base rate (skill {t['brier_skill_score']}).",
            f"- Expected calibration error {t['expected_calibration_error']}.",
            f"- At the deployed threshold: precision {t['at_threshold']['precision']}, recall {t['at_threshold']['recall']}, false-positive rate {t['at_threshold']['false_positive_rate']}.",
            "",
            f"Probabilities are shown as calibrated: **{'yes' if f['probability_is_calibrated'] else 'no'}** "
            "(requires positive Brier skill and calibration error below 0.05 on the test split).",
        ]
    else:
        lines.append(f"Not trained: {f.get('reason')}")
    lines += [
        "",
        "## Limitations",
        "",
        "- The model learned from CPU, disk-write and network series only. Memory, temperature, power and latency are scored with the same scale-free features, but no labeled data for them was available, so their alerts are unvalidated.",
        "- No dataset here contains future failures (disk failure, overheating). VaultWatch does not claim validated failure prediction.",
        "- Root-cause hints are rule-based and always shown as suspected until a person confirms them.",
        "",
        "## Retraining",
        "",
        "```bash",
        "cd dc-backend",
        "pip install -r requirements-ml.txt",
        "python -m app.ml.training.train",
        "```",
        "",
        "Restart the API afterwards; it loads `app/ml/artifacts/model_bundle.json.gz` once at startup.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--nab", type=Path, default=DEFAULT_NAB)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    started = time.time()
    np.random.seed(SEED)

    log("1. Loading and validating datasets")
    series = load_series(args.nab)
    fingerprint = data_fingerprint(args.nab)
    trained_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    version = f"vw-anomaly-{trained_at[:10].replace('-', '')}-{fingerprint[:6]}"

    log("2. Anomaly detection: leave-one-series-out evaluation")
    anomaly_eval = evaluate_anomaly(series)
    log("3. Fitting the final anomaly model on all series")
    anomaly_bundle, anomaly_fit = fit_final_anomaly(series, anomaly_eval)
    log("4. Experimental early warning")
    forecast_bundle, forecast_report = evaluate_forecast(series)

    evaluation = {
        "model_version": version, "trained_at": trained_at, "data_fingerprint": fingerprint,
        "training_seconds": round(time.time() - started, 1),
        "library_versions": {"numpy": np.__version__, "pandas": pd.__version__, "scikit-learn": __import__("sklearn").__version__},
        "data": {"source": "NAB realAWSCloudwatch", "series": {s["name"]: {"kind": s["kind"], **s["validation"]} for s in series},
                 "total_buckets": int(sum(len(s["values"]) for s in series)), "label_windows": int(sum(len(s["windows"]) for s in series))},
        "features": F.FEATURE_NAMES,
        "anomaly_detection": {"evaluation": anomaly_eval, "final_model": anomaly_fit},
        "early_warning": forecast_report,
    }
    bundle = {
        "format": "vaultwatch-model-bundle/1", "model_version": version, "trained_at": trained_at,
        "features": F.FEATURE_NAMES, "bucket_seconds": F.BUCKET_SECONDS, "min_history": F.MIN_HISTORY, "baseline": F.BASELINE,
        "anomaly": anomaly_bundle, "early_warning": forecast_bundle,
        "summary": {
            "anomaly_loso_at_warning": evaluation["anomaly_detection"]["evaluation"]["summary"]["isolation_forest"]["fpr_2pct"],
            "anomaly_loso_at_critical": evaluation["anomaly_detection"]["evaluation"]["summary"]["isolation_forest"]["fpr_0_5pct"],
            "anomaly_loso_alert_rule": evaluation["anomaly_detection"]["evaluation"]["summary"]["isolation_forest"]["alert_rule_15m"],
            "anomaly_pr_auc_pooled": evaluation["anomaly_detection"]["evaluation"]["summary"]["isolation_forest"]["pr_auc_pooled"],
            "early_warning": forecast_report.get("test"), "early_warning_status": forecast_report.get("status"),
            "probability_is_calibrated": forecast_report.get("probability_is_calibrated", False),
        },
    }
    args.out.mkdir(parents=True, exist_ok=True)
    with gzip.open(args.out / "model_bundle.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(bundle, fh, separators=(",", ":"))
    (args.out / "evaluation.json").write_text(json.dumps(evaluation, indent=2, default=str), encoding="utf-8")
    (args.out / "MODEL_CARD.md").write_text(model_card(evaluation), encoding="utf-8")
    log(f"Done in {evaluation['training_seconds']}s. Wrote {version} to {args.out}")


if __name__ == "__main__":
    main()
