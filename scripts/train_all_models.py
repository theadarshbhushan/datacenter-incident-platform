#!/usr/bin/env python3
"""
End-to-End Training Pipeline for Data Center Incident Platform ML Models
Trains:
1. Isolation Forest: Unsupervised Anomaly Detection
2. XGBoost Classifier: Multivariate 6-Class Anomaly Classification
3. Bi-LSTM Forecaster with Temporal Attention: 10-step Lead CPU & RAM Forecasting

Persists trained models, scalers, and evaluation metrics in dc-ml/saved_models/
and produces a unified evaluation report.
"""

import os
import sys
import json
import time
import random
import copy
import warnings
from pathlib import Path
from datetime import datetime

warnings.filterwarnings("ignore")

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import IsolationForest
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix,
)
from xgboost import XGBClassifier

import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from torch.optim.lr_scheduler import ReduceLROnPlateau

# Fix Windows console encoding for UTF-8 box characters
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "dc-ml" / "datasets" / "processed"
SAVED_MODELS_DIR = BASE_DIR / "dc-ml" / "saved_models"
SAVED_MODELS_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_PATH = PROCESSED_DIR / "train.csv"
TEST_PATH = PROCESSED_DIR / "test.csv"

# Global Reproducibility
RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)
torch.manual_seed(RANDOM_SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(RANDOM_SEED)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Base feature columns
FEATURE_COLS = [
    "cpu_pct",
    "ram_pct",
    "disk_io_mbps",
    "net_mbps",
    "temp_celsius",
    "disk_used_pct",
]


# =============================================================================
# MODEL 3 ARCHITECTURE DEFINITIONS
# =============================================================================

class TemporalAttention(nn.Module):
    """
    Computes temporal attention weights over the Bi-LSTM output sequence.
    Linear(256, 64) -> tanh -> Linear(64, 1) -> softmax
    """
    def __init__(self, hidden_dim: int = 256, attn_dim: int = 64):
        super().__init__()
        self.fc1 = nn.Linear(hidden_dim, attn_dim)
        self.tanh = nn.Tanh()
        self.fc2 = nn.Linear(attn_dim, 1)
        self.softmax = nn.Softmax(dim=1)

    def forward(self, lstm_out: torch.Tensor):
        # lstm_out: (batch_size, seq_len=60, hidden_dim=256)
        scores = self.fc2(self.tanh(self.fc1(lstm_out)))  # (batch_size, seq_len, 1)
        weights = self.softmax(scores)                     # (batch_size, seq_len, 1)
        context = torch.sum(weights * lstm_out, dim=1)     # (batch_size, hidden_dim=256)
        return context, weights.squeeze(-1)


class BiLSTMForecaster(nn.Module):
    """
    Bidirectional LSTM with Temporal Attention for multi-step CPU & RAM forecasting.
    LSTM: input=6, hidden=128, layers=2, bidirectional=True, dropout=0.3
    Attention layer
    FC: 256 -> 128 -> 20 (10 steps * 2 metrics)
    """
    def __init__(
        self,
        input_size: int = 6,
        hidden_size: int = 128,
        num_layers: int = 2,
        output_steps: int = 10,
        output_features: int = 2,
        dropout: float = 0.3,
    ):
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.output_steps = output_steps
        self.output_features = output_features

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            bidirectional=True,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        # Bidirectional with hidden_size=128 gives 256 features
        self.attention = TemporalAttention(hidden_dim=hidden_size * 2, attn_dim=64)
        self.fc = nn.Sequential(
            nn.Linear(hidden_size * 2, 128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, output_steps * output_features),
        )

    def forward(self, x: torch.Tensor):
        # x: (batch_size, seq_len=60, input_size=6)
        lstm_out, _ = self.lstm(x)             # (batch_size, seq_len, 256)
        context, weights = self.attention(lstm_out) # (batch_size, 256)
        out = self.fc(context)                 # (batch_size, 20)
        return out.view(-1, self.output_steps, self.output_features), weights


# =============================================================================
# DATA PREPARATION HELPERS
# =============================================================================

def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    """Engineer ratio, stress, and pressure metrics for XGBoost."""
    df = df.copy()
    df["cpu_ram_ratio"] = df["cpu_pct"] / (df["ram_pct"] + 1.0)
    df["thermal_stress"] = (df["temp_celsius"] * df["cpu_pct"]) / 100.0
    df["io_pressure"] = df["disk_io_mbps"] + df["net_mbps"]
    return df


def create_sequences_per_server(
    df: pd.DataFrame,
    feature_cols: list,
    target_cols: list,
    seq_len: int = 60,
    pred_steps: int = 10,
    scaler: StandardScaler = None,
    fit_scaler: bool = False,
):
    """
    Sorts chronological records per server and extracts sliding windows.
    Returns (X_seq, y_seq, scaler).
    """
    df_sorted = df.copy()
    df_sorted["dt"] = pd.to_datetime(df_sorted["timestamp"])
    df_sorted = df_sorted.sort_values(by=["server_id", "dt"]).reset_index(drop=True)

    if fit_scaler:
        scaler = StandardScaler()
        scaler.fit(df_sorted[feature_cols].values)

    all_X = []
    all_y = []

    for _, s_group in df_sorted.groupby("server_id"):
        s_group = s_group.sort_values(by="dt").reset_index(drop=True)
        raw_x = s_group[feature_cols].values
        scaled_x = scaler.transform(raw_x)
        targets = s_group[target_cols].values

        n_rows = len(s_group)
        for i in range(n_rows - seq_len - pred_steps + 1):
            all_X.append(scaled_x[i : i + seq_len])
            all_y.append(targets[i + seq_len : i + seq_len + pred_steps])

    return np.array(all_X, dtype=np.float32), np.array(all_y, dtype=np.float32), scaler


# =============================================================================
# MODEL 1: ISOLATION FOREST
# =============================================================================

def train_isolation_forest(train_df: pd.DataFrame, test_df: pd.DataFrame):
    print("\n" + "═" * 70)
    print("MODEL 1: Isolation Forest (Unsupervised Anomaly Detector)")
    print("═" * 70)

    X_train = train_df[FEATURE_COLS].values
    y_train_binary = train_df["is_anomaly"].astype(bool).values

    X_test = test_df[FEATURE_COLS].values
    y_test_binary = test_df["is_anomaly"].astype(bool).values

    print(f"  Scaling features ({len(FEATURE_COLS)} features)...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    print("  Training IsolationForest (n_estimators=200, contamination=0.18)...")
    t0 = time.time()
    iso_forest = IsolationForest(
        n_estimators=200,
        contamination=0.18,
        random_state=RANDOM_SEED,
        max_samples="auto",
        n_jobs=-1,
    )
    iso_forest.fit(X_train_scaled)
    train_time = time.time() - t0
    print(f"  Isolation Forest trained in {train_time:.2f}s")

    # Evaluation on test set
    raw_preds = iso_forest.predict(X_test_scaled)
    # IsolationForest: -1 = anomaly, 1 = normal
    y_pred_binary = raw_preds == -1

    # Score samples: lower values are more abnormal; negate for standard ROC-AUC
    scores = -iso_forest.score_samples(X_test_scaled)

    acc = accuracy_score(y_test_binary, y_pred_binary)
    prec = precision_score(y_test_binary, y_pred_binary, zero_division=0)
    rec = recall_score(y_test_binary, y_pred_binary, zero_division=0)
    f1 = f1_score(y_test_binary, y_pred_binary, zero_division=0)
    roc_auc = roc_auc_score(y_test_binary, scores)

    print(f"  [Evaluation Results]")
    print(f"    Accuracy:  {acc * 100:.2f}%")
    print(f"    Precision: {prec * 100:.2f}%")
    print(f"    Recall:    {rec * 100:.2f}%")
    print(f"    F1 Score:  {f1 * 100:.2f}%")
    print(f"    ROC-AUC:   {roc_auc * 100:.2f}%")

    # Save artifacts
    model_path = SAVED_MODELS_DIR / "isolation_forest.pkl"
    scaler_path = SAVED_MODELS_DIR / "if_scaler.pkl"
    metrics_path = SAVED_MODELS_DIR / "if_metrics.json"

    joblib.dump(iso_forest, model_path)
    joblib.dump(scaler, scaler_path)
    # Also save as .joblib for legacy service compatibility
    joblib.dump(iso_forest, SAVED_MODELS_DIR / "isolation_forest.joblib")

    metrics = {
        "model": "Isolation Forest",
        "n_estimators": 200,
        "contamination": 0.18,
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "training_time_seconds": round(train_time, 2),
        "accuracy": round(float(acc), 4),
        "precision": round(float(prec), 4),
        "recall": round(float(rec), 4),
        "f1_score": round(float(f1), 4),
        "roc_auc": round(float(roc_auc), 4),
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"  ✓ Saved model:   {model_path.name}")
    print(f"  ✓ Saved scaler:  {scaler_path.name}")
    print(f"  ✓ Saved metrics: {metrics_path.name}")

    return metrics, iso_forest


# =============================================================================
# MODEL 2: XGBOOST CLASSIFIER
# =============================================================================

def train_xgboost(train_df: pd.DataFrame, test_df: pd.DataFrame):
    print("\n" + "═" * 70)
    print("MODEL 2: XGBoost Multi-Class Anomaly Classifier")
    print("═" * 70)

    # Feature engineering
    print("  Adding engineered features (cpu_ram_ratio, thermal_stress, io_pressure)...")
    train_eng = add_engineered_features(train_df)
    test_eng = add_engineered_features(test_df)

    xgb_features = FEATURE_COLS + ["cpu_ram_ratio", "thermal_stress", "io_pressure"]

    X_train = train_eng[xgb_features].values
    X_test = test_eng[xgb_features].values

    # Encode multiclass labels
    encoder = LabelEncoder()
    y_train = encoder.fit_transform(train_eng["anomaly_type"].values)
    y_test = encoder.transform(test_eng["anomaly_type"].values)

    print(f"  Classes ({len(encoder.classes_)}): {list(encoder.classes_)}")

    # Feature scaling
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Compute balanced sample weights to handle class imbalance
    sample_weights = compute_sample_weight("balanced", y_train)

    print("  Training XGBClassifier (n_estimators=300, max_depth=6, lr=0.1)...")
    t0 = time.time()
    xgb_params = {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.1,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "eval_metric": "mlogloss",
        "random_state": RANDOM_SEED,
        "n_jobs": -1,
    }
    if len(encoder.classes_) == 2:
        xgb_params["scale_pos_weight"] = 4
    xgb_clf = XGBClassifier(**xgb_params)
    xgb_clf.fit(X_train_scaled, y_train, sample_weight=sample_weights)
    train_time = time.time() - t0
    print(f"  XGBoost trained in {train_time:.2f}s")

    # Evaluation on test set
    y_pred = xgb_clf.predict(X_test_scaled)
    y_proba = xgb_clf.predict_proba(X_test_scaled)

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average="weighted", zero_division=0)
    rec = recall_score(y_test, y_pred, average="weighted", zero_division=0)
    f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)

    try:
        roc_auc = roc_auc_score(y_test, y_proba, multi_class="ovr", average="weighted")
    except Exception:
        roc_auc = 0.0

    cls_report = classification_report(
        y_test, y_pred, target_names=encoder.classes_, output_dict=True, zero_division=0
    )
    conf_mat = confusion_matrix(y_test, y_pred).tolist()

    print(f"  [Evaluation Results]")
    print(f"    Accuracy:     {acc * 100:.2f}%")
    print(f"    Precision:    {prec * 100:.2f}% (weighted)")
    print(f"    Recall:       {rec * 100:.2f}% (weighted)")
    print(f"    F1 Score:     {f1 * 100:.2f}% (weighted)")
    print(f"    ROC-AUC:      {roc_auc * 100:.2f}% (OvR weighted)")

    print("\n  Per-Class Classification Report:")
    for cls_name in encoder.classes_:
        c_stats = cls_report.get(cls_name, {})
        print(
            f"    {cls_name:<16}: Precision={c_stats.get('precision', 0) * 100:>5.1f}%, "
            f"Recall={c_stats.get('recall', 0) * 100:>5.1f}%, "
            f"F1={c_stats.get('f1-score', 0) * 100:>5.1f}% "
            f"(Support: {c_stats.get('support', 0):>4})"
        )

    # Save artifacts
    model_path = SAVED_MODELS_DIR / "xgboost_model.pkl"
    encoder_path = SAVED_MODELS_DIR / "xgb_encoder.pkl"
    scaler_path = SAVED_MODELS_DIR / "xgb_scaler.pkl"
    metrics_path = SAVED_MODELS_DIR / "xgb_metrics.json"

    joblib.dump(xgb_clf, model_path)
    joblib.dump(encoder, encoder_path)
    joblib.dump(scaler, scaler_path)
    # Also save as .joblib for legacy service compatibility
    joblib.dump(xgb_clf, SAVED_MODELS_DIR / "xgboost_classifier.joblib")

    metrics = {
        "model": "XGBoost Classifier",
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.1,
        "features": xgb_features,
        "classes": list(encoder.classes_),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "training_time_seconds": round(train_time, 2),
        "accuracy": round(float(acc), 4),
        "precision": round(float(prec), 4),
        "recall": round(float(rec), 4),
        "f1_score": round(float(f1), 4),
        "roc_auc": round(float(roc_auc), 4),
        "classification_report": cls_report,
        "confusion_matrix": conf_mat,
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\n  ✓ Saved model:   {model_path.name}")
    print(f"  ✓ Saved encoder: {encoder_path.name}")
    print(f"  ✓ Saved scaler:  {scaler_path.name}")
    print(f"  ✓ Saved metrics: {metrics_path.name}")

    return metrics, xgb_clf


# =============================================================================
# MODEL 3: BI-LSTM WITH TEMPORAL ATTENTION
# =============================================================================

def train_bilstm(train_df: pd.DataFrame, test_df: pd.DataFrame):
    print("\n" + "═" * 70)
    print("MODEL 3: Bi-LSTM Forecaster with Temporal Attention")
    print(f"  Device: {DEVICE}")
    print("═" * 70)

    target_cols = ["cpu_pct", "ram_pct"]

    print("  Constructing chronological sliding-window sequences (60 input steps -> 10 future steps)...")
    # Combine datasets to reconstitute per-server chronological streams
    full_df = pd.concat([train_df, test_df], ignore_index=True)

    # Sort each server's history chronologically and split 80/20 by time
    train_server_dfs = []
    test_server_dfs = []

    for s_id, s_group in full_df.groupby("server_id"):
        s_group = s_group.sort_values(by="timestamp").reset_index(drop=True)
        split_idx = int(len(s_group) * 0.8)
        train_server_dfs.append(s_group.iloc[:split_idx])
        test_server_dfs.append(s_group.iloc[split_idx:])

    server_train_df = pd.concat(train_server_dfs, ignore_index=True)
    server_test_df = pd.concat(test_server_dfs, ignore_index=True)

    # Build sequence arrays
    X_train_seq, y_train_seq, scaler = create_sequences_per_server(
        server_train_df,
        feature_cols=FEATURE_COLS,
        target_cols=target_cols,
        seq_len=60,
        pred_steps=10,
        fit_scaler=True,
    )

    X_test_seq, y_test_seq, _ = create_sequences_per_server(
        server_test_df,
        feature_cols=FEATURE_COLS,
        target_cols=target_cols,
        seq_len=60,
        pred_steps=10,
        scaler=scaler,
        fit_scaler=False,
    )

    print(f"  Train sequences: {X_train_seq.shape}  |  Targets: {y_train_seq.shape}")
    print(f"  Test sequences:  {X_test_seq.shape}   |  Targets: {y_test_seq.shape}")

    # PyTorch DataLoaders
    train_dataset = TensorDataset(
        torch.tensor(X_train_seq, dtype=torch.float32),
        torch.tensor(y_train_seq, dtype=torch.float32),
    )
    test_dataset = TensorDataset(
        torch.tensor(X_test_seq, dtype=torch.float32),
        torch.tensor(y_test_seq, dtype=torch.float32),
    )

    batch_size = 64
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False)

    # Initialize model, loss, optimizer, scheduler
    model = BiLSTMForecaster(
        input_size=len(FEATURE_COLS),
        hidden_size=128,
        num_layers=2,
        output_steps=10,
        output_features=2,
        dropout=0.3,
    ).to(DEVICE)

    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-5)
    scheduler = ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=5)

    epochs = 30
    early_stopping_patience = 10
    best_test_loss = float("inf")
    patience_counter = 0
    best_model_state = None

    print(f"\n  Starting training for {epochs} epochs (batch_size={batch_size}, lr=0.001)...")
    t0 = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
            optimizer.zero_grad()
            preds, _ = model(batch_x)
            loss = criterion(preds, batch_y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * len(batch_x)

        train_loss /= len(train_dataset)

        # Validation step
        model.eval()
        test_loss = 0.0
        with torch.no_grad():
            for batch_x, batch_y in test_loader:
                batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
                preds, _ = model(batch_x)
                loss = criterion(preds, batch_y)
                test_loss += loss.item() * len(batch_x)

        test_loss /= len(test_dataset)
        scheduler.step(test_loss)

        if test_loss < best_test_loss:
            best_test_loss = test_loss
            patience_counter = 0
            best_model_state = copy.deepcopy(model.state_dict())
            marker = "★ Best"
        else:
            patience_counter += 1
            marker = f"Patience: {patience_counter}/{early_stopping_patience}"

        if epoch % 5 == 0 or epoch == 1 or patience_counter == 0:
            print(
                f"    Epoch {epoch:02d}/{epochs} | Train MSE: {train_loss:6.2f} | "
                f"Test MSE: {test_loss:6.2f} | {marker}"
            )

        if patience_counter >= early_stopping_patience:
            print(f"    Early stopping triggered at epoch {epoch} (patience={early_stopping_patience})")
            break

    train_time = time.time() - t0
    print(f"  Training finished in {train_time:.2f}s")

    # Load best weights
    if best_model_state is not None:
        model.load_state_dict(best_model_state)

    # Evaluation on test sequences
    model.eval()
    all_preds = []
    all_targets = []

    with torch.no_grad():
        for batch_x, batch_y in test_loader:
            batch_x = batch_x.to(DEVICE)
            preds, _ = model(batch_x)
            all_preds.append(preds.cpu().numpy())
            all_targets.append(batch_y.numpy())

    y_pred_arr = np.concatenate(all_preds, axis=0)      # (N, 10, 2)
    y_true_arr = np.concatenate(all_targets, axis=0)    # (N, 10, 2)

    # Clamping predictions to valid bounds [0, 100]
    y_pred_arr = np.clip(y_pred_arr, 0.0, 100.0)

    # CPU metrics (index 0)
    cpu_true = y_true_arr[:, :, 0]
    cpu_pred = y_pred_arr[:, :, 0]
    mae_cpu = float(np.mean(np.abs(cpu_true - cpu_pred)))
    rmse_cpu = float(np.sqrt(np.mean((cpu_true - cpu_pred) ** 2)))
    mape_cpu = float(np.mean(np.abs((cpu_true - cpu_pred) / np.maximum(cpu_true, 1.0))) * 100.0)

    # RAM metrics (index 1)
    ram_true = y_true_arr[:, :, 1]
    ram_pred = y_pred_arr[:, :, 1]
    mae_ram = float(np.mean(np.abs(ram_true - ram_pred)))
    rmse_ram = float(np.sqrt(np.mean((ram_true - ram_pred) ** 2)))
    mape_ram = float(np.mean(np.abs((ram_true - ram_pred) / np.maximum(ram_true, 1.0))) * 100.0)

    overall_mae = (mae_cpu + mae_ram) / 2.0
    overall_rmse = (rmse_cpu + rmse_ram) / 2.0
    overall_mape = (mape_cpu + mape_ram) / 2.0

    print(f"\n  [Evaluation Results on Test Sequences]")
    print(f"    CPU Forecast  — MAE: {mae_cpu:.2f}% | RMSE: {rmse_cpu:.2f}% | MAPE: {mape_cpu:.2f}%")
    print(f"    RAM Forecast  — MAE: {mae_ram:.2f}% | RMSE: {rmse_ram:.2f}% | MAPE: {mape_ram:.2f}%")
    print(f"    Combined Mean — MAE: {overall_mae:.2f}% | RMSE: {overall_rmse:.2f}% | MAPE: {overall_mape:.2f}%")

    # Save artifacts
    model_path = SAVED_MODELS_DIR / "bilstm_model.pt"
    scaler_path = SAVED_MODELS_DIR / "lstm_scaler.pkl"
    metrics_path = SAVED_MODELS_DIR / "lstm_metrics.json"

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "input_size": len(FEATURE_COLS),
            "hidden_size": 128,
            "num_layers": 2,
            "output_steps": 10,
            "output_features": 2,
            "feature_cols": FEATURE_COLS,
            "target_cols": target_cols,
        },
        model_path,
    )
    joblib.dump(scaler, scaler_path)

    metrics = {
        "model": "Bi-LSTM with Temporal Attention",
        "architecture": {
            "input_features": len(FEATURE_COLS),
            "hidden_size": 128,
            "num_layers": 2,
            "bidirectional": True,
            "attention_dim": 64,
            "output_steps": 10,
            "output_features": 2,
        },
        "sequence_length": 60,
        "forecast_steps": 10,
        "train_sequences": len(X_train_seq),
        "test_sequences": len(X_test_seq),
        "training_time_seconds": round(train_time, 2),
        "mae_cpu": round(mae_cpu, 3),
        "rmse_cpu": round(rmse_cpu, 3),
        "mape_cpu": round(mape_cpu, 3),
        "mae_ram": round(mae_ram, 3),
        "rmse_ram": round(rmse_ram, 3),
        "mape_ram": round(mape_ram, 3),
        "overall_mae": round(overall_mae, 3),
        "overall_rmse": round(overall_rmse, 3),
        "overall_mape": round(overall_mape, 3),
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\n  ✓ Saved model:   {model_path.name}")
    print(f"  ✓ Saved scaler:  {scaler_path.name}")
    print(f"  ✓ Saved metrics: {metrics_path.name}")

    return metrics, model


# =============================================================================
# COMBINED METRICS & FINAL PERFORMANCE REPORT
# =============================================================================

def print_final_report(if_metrics: dict, xgb_metrics: dict, lstm_metrics: dict):
    combined_path = SAVED_MODELS_DIR / "combined_metrics.json"

    combined = {
        "timestamp": datetime.now().isoformat(),
        "models": {
            "isolation_forest": if_metrics,
            "xgboost": xgb_metrics,
            "bilstm_attention": lstm_metrics,
        },
        "summary": {
            "isolation_forest": {
                "accuracy": f"{if_metrics['accuracy'] * 100:.1f}%",
                "f1_score": f"{if_metrics['f1_score'] * 100:.1f}%",
                "roc_auc": f"{if_metrics['roc_auc'] * 100:.1f}%",
            },
            "xgboost": {
                "accuracy": f"{xgb_metrics['accuracy'] * 100:.1f}%",
                "f1_score": f"{xgb_metrics['f1_score'] * 100:.1f}%",
                "roc_auc": f"{xgb_metrics['roc_auc'] * 100:.1f}%",
            },
            "bilstm": {
                "accuracy": "N/A",
                "f1_score": "N/A",
                "mae": f"MAE: {lstm_metrics['overall_mae']:.2f}%",
            },
        },
    }

    with open(combined_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2)

    # Format the requested ASCII box table
    if_acc = f"{if_metrics['accuracy'] * 100:.1f}%"
    if_f1 = f"{if_metrics['f1_score'] * 100:.1f}%"
    if_auc = f"{if_metrics['roc_auc'] * 100:.1f}%"

    xgb_acc = f"{xgb_metrics['accuracy'] * 100:.1f}%"
    xgb_f1 = f"{xgb_metrics['f1_score'] * 100:.1f}%"
    xgb_auc = f"{xgb_metrics['roc_auc'] * 100:.1f}%"

    lstm_mae = f"MAE: {lstm_metrics['overall_mae']:.2f}"

    report = f"""
╔══════════════════════════════════════════════════╗
║           MODEL PERFORMANCE REPORT               ║
╠══════════════╦══════════╦═══════════╦════════════╣
║ Model        ║ Accuracy ║ F1 Score  ║ ROC-AUC    ║
╠══════════════╬══════════╬═══════════╬════════════╣
║ Iso Forest   ║  {if_acc:<7} ║  {if_f1:<8} ║  {if_auc:<10}║
║ XGBoost      ║  {xgb_acc:<7} ║  {xgb_f1:<8} ║  {xgb_auc:<10}║
║ Bi-LSTM      ║  N/A     ║  N/A      ║  {lstm_mae:<10}║
╚══════════════╩══════════╩═══════════╩════════════╝
"""
    print(report)
    print(f"  ✓ Combined metrics saved to: {combined_path}")


def main():
    print("=" * 70)
    print("DATA CENTER INCIDENT PLATFORM -- MODEL TRAINING PIPELINE")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    if not TRAIN_PATH.exists() or not TEST_PATH.exists():
        print(f"Error: Required datasets missing. Run scripts/preprocess_data.py first.")
        sys.exit(1)

    print(f"Loading train dataset: {TRAIN_PATH}")
    train_df = pd.read_csv(TRAIN_PATH)
    print(f"  Train shape: {train_df.shape}")

    print(f"Loading test dataset:  {TEST_PATH}")
    test_df = pd.read_csv(TEST_PATH)
    print(f"  Test shape:  {test_df.shape}")

    # Train Model 1
    if_metrics, _ = train_isolation_forest(train_df, test_df)

    # Train Model 2
    xgb_metrics, _ = train_xgboost(train_df, test_df)

    # Train Model 3
    lstm_metrics, _ = train_bilstm(train_df, test_df)

    # Final Report
    print_final_report(if_metrics, xgb_metrics, lstm_metrics)
    sys.exit(0)


if __name__ == "__main__":
    main()
