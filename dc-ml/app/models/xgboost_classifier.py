"""
XGBoost multi-class classifier for incident-type prediction.

Maps metric feature vectors to one of six incident categories:
  cpu_spike | memory_leak | disk_failure |
  network_anomaly | thermal_event | predicted_outage
"""

import os
import numpy as np
import joblib
try:
    import mlflow
except ImportError:
    mlflow = None
import shap
from xgboost import XGBClassifier
from loguru import logger

from app.utils.preprocessor import INCIDENT_TYPES, IDX_TO_INCIDENT_TYPE

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "saved_models")
MODEL_PATH = os.path.join(MODEL_DIR, "xgboost_classifier.joblib")

NUM_CLASSES = len(INCIDENT_TYPES)
INCIDENT_TYPE_TO_IDX = {t: i for i, t in enumerate(INCIDENT_TYPES)}

FEATURE_NAMES = [
    "cpu_pct",
    "ram_pct",
    "disk_io_mbps",
    "net_mbps",
    "temp_celsius",
    "cpu_trend",
    "ram_trend",
]


class IncidentClassifier:
    """Thin wrapper around XGBClassifier for incident-type prediction."""

    def __init__(self):
        self.model: XGBClassifier | None = None
        self._is_trained = False

    # ── Training ─────────────────────────────────────────────────────────
    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        n_estimators: int = 200,
        max_depth: int = 6,
        learning_rate: float = 0.1,
        random_state: int = 42,
    ) -> dict:
        """
        Fit an XGBClassifier on *(X, y)* and persist to disk.

        Parameters
        ----------
        X : ndarray (N, 7) — feature vectors.
        y : ndarray (N,)   — integer class labels in [0, NUM_CLASSES).

        Returns a summary dict.
        """
        logger.info(
            f"Training XGBClassifier — samples={X.shape[0]}, "
            f"features={X.shape[1]}, classes={NUM_CLASSES}"
        )

        self.model = XGBClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            objective="multi:softprob",
            num_class=NUM_CLASSES,
            eval_metric="mlogloss",
            random_state=random_state,
            use_label_encoder=False,
            n_jobs=-1,
        )
        self.model.fit(X, y)
        self._is_trained = True

        # Persist
        os.makedirs(MODEL_DIR, exist_ok=True)
        joblib.dump(self.model, MODEL_PATH)
        logger.info(f"XGBoost classifier saved to {MODEL_PATH}")

        # Accuracy on training set (quick sanity check)
        train_acc = float(np.mean(self.model.predict(X) == y))

        # MLflow logging (best-effort)
        try:
            mlflow.log_params({
                "xgb_n_estimators": n_estimators,
                "xgb_max_depth": max_depth,
                "xgb_learning_rate": learning_rate,
                "xgb_n_samples": X.shape[0],
            })
            mlflow.log_metric("xgb_train_accuracy", train_acc)
        except Exception as e:
            logger.warning(f"MLflow logging skipped: {e}")

        return {
            "model": "xgboost_classifier",
            "n_samples": int(X.shape[0]),
            "n_features": int(X.shape[1]),
            "train_accuracy": round(train_acc, 4),
        }

    # ── Inference ────────────────────────────────────────────────────────
    def predict(self, X: np.ndarray) -> dict:
        """
        Classify the input feature vector.

        Parameters
        ----------
        X : ndarray of shape (1, 7)

        Returns
        -------
        dict with keys:
            incident_type : str   — one of INCIDENT_TYPES
            confidence    : float — probability of the chosen class
        """
        if not self._is_trained or self.model is None:
            raise RuntimeError("Model has not been trained yet")

        probabilities = self.model.predict_proba(X)
        predicted_idx = int(np.argmax(probabilities, axis=1)[0])
        confidence = float(probabilities[0, predicted_idx])

        incident_type = IDX_TO_INCIDENT_TYPE.get(predicted_idx, "predicted_outage")

        return {
            "incident_type": incident_type,
            "confidence": round(confidence, 4),
        }

    # ── Explainability (SHAP) ────────────────────────────────────────────
    def explain(self, metrics: dict) -> dict:
        """
        Compute XGBoost prediction and SHAP feature attributions for the given metrics.

        Parameters
        ----------
        metrics : dict
            Dictionary containing metric values (cpu_pct, ram_pct, temp_celsius, etc.).

        Returns
        -------
        dict with keys:
            incident_type : str
            confidence    : float
            top_features  : list of dicts with feature, value, shap_value, explanation
            summary       : str
        """
        if not self._is_trained or self.model is None:
            raise RuntimeError("Model has not been trained yet")

        # Prepare 7-element feature vector matching model schema
        cpu = float(metrics.get("cpu_pct", 0.0))
        ram = float(metrics.get("ram_pct", 0.0))
        disk = float(metrics.get("disk_io_mbps", 0.0))
        net = float(metrics.get("net_mbps", 0.0))
        temp = float(metrics.get("temp_celsius", 0.0))
        cpu_trend = float(metrics.get("cpu_trend", 0.0))
        ram_trend = float(metrics.get("ram_trend", 0.0))

        X = np.array([[cpu, ram, disk, net, temp, cpu_trend, ram_trend]], dtype=np.float32)

        # 1. Prediction using unchanged predict()
        pred_res = self.predict(X)
        incident_type = pred_res["incident_type"]
        confidence = pred_res["confidence"]
        predicted_idx = INCIDENT_TYPE_TO_IDX.get(incident_type, 5)

        # 2. Compute SHAP values using shap.TreeExplainer(self.model)
        explainer = shap.TreeExplainer(self.model)
        shap_values = explainer.shap_values(X)

        # Extract 1D array of SHAP values for the predicted class
        if isinstance(shap_values, list):
            if predicted_idx < len(shap_values):
                class_shap = np.array(shap_values[predicted_idx]).flatten()
            else:
                class_shap = np.array(shap_values[0]).flatten()
        elif isinstance(shap_values, np.ndarray):
            if shap_values.ndim == 3:
                if shap_values.shape[2] == NUM_CLASSES:
                    class_shap = shap_values[0, :, predicted_idx]
                elif shap_values.shape[1] == NUM_CLASSES:
                    class_shap = shap_values[0, predicted_idx, :]
                else:
                    class_shap = shap_values[0, :, 0]
            elif shap_values.ndim == 2:
                class_shap = shap_values[0]
            else:
                class_shap = shap_values.flatten()
        else:
            class_shap = np.array(shap_values).flatten()

        # Build feature contributions list
        feature_contributions = []
        for idx, feat_name in enumerate(FEATURE_NAMES):
            feat_val = float(X[0, idx])
            shap_val = float(class_shap[idx]) if idx < len(class_shap) else 0.0
            feature_contributions.append({
                "feature": feat_name,
                "value": feat_val,
                "shap_value": round(shap_val, 4),
            })

        # Sort features by highest positive impact on the predicted class
        sorted_features = sorted(
            feature_contributions,
            key=lambda item: (item["shap_value"], abs(item["shap_value"])),
            reverse=True,
        )

        positive_items = [f for f in sorted_features if f["shap_value"] > 0]
        top_items = positive_items[:3] if positive_items else sorted_features[:3]

        top_features = []
        for item in top_items:
            feat = item["feature"]
            val = item["value"]
            sv = item["shap_value"]
            v_int = int(round(val))

            if feat == "cpu_pct":
                label = f"CPU at {v_int}%"
            elif feat == "ram_pct":
                label = f"RAM at {v_int}%"
            elif feat == "temp_celsius":
                label = f"Temperature at {v_int}°C"
            elif feat == "disk_io_mbps":
                label = f"Disk I/O at {v_int} MB/s"
            elif feat == "net_mbps":
                label = f"Network traffic at {v_int} MB/s"
            elif feat == "cpu_trend":
                sign = "+" if val >= 0 else ""
                label = f"CPU trend ({sign}{val:.1f}%)"
            elif feat == "ram_trend":
                sign = "+" if val >= 0 else ""
                label = f"RAM trend ({sign}{val:.1f}%)"
            else:
                label = f"{feat} at {val}"

            verb = "strongly driving" if (sv >= 0.5 or item == top_items[0]) else "contributing to"
            explanation = f"{label} is {verb} {incident_type} prediction"

            top_features.append({
                "feature": feat,
                "value": val,
                "shap_value": sv,
                "explanation": explanation,
            })

        # Generate one-sentence summary
        def _phrase(feat: str, val: float, is_first: bool = False) -> str:
            v_int = int(round(val))
            if feat == "cpu_pct":
                prefix = "High" if is_first else "high"
                return f"{prefix} CPU ({v_int}%)"
            elif feat == "ram_pct":
                prefix = "High" if is_first else "high"
                return f"{prefix} RAM ({v_int}%)"
            elif feat == "temp_celsius":
                prefix = "Elevated" if is_first else "elevated"
                return f"{prefix} temperature ({v_int}°C)"
            elif feat == "disk_io_mbps":
                prefix = "High" if is_first else "high"
                return f"{prefix} disk I/O ({v_int} MB/s)"
            elif feat == "net_mbps":
                prefix = "High" if is_first else "high"
                return f"{prefix} network throughput ({v_int} MB/s)"
            elif feat == "cpu_trend":
                prefix = "Rising" if is_first else "rising"
                sign = "+" if val >= 0 else ""
                return f"{prefix} CPU trend ({sign}{val:.1f}%)"
            elif feat == "ram_trend":
                prefix = "Rising" if is_first else "rising"
                sign = "+" if val >= 0 else ""
                return f"{prefix} RAM trend ({sign}{val:.1f}%)"
            return f"{feat} ({v_int})"

        # Pick the most meaningful top features for the summary
        meaningful_feats = [
            f for f in top_features
            if not (f["feature"] in ("cpu_trend", "ram_trend") and abs(f["value"]) < 0.1)
        ]
        if not meaningful_feats:
            meaningful_feats = top_features

        if len(meaningful_feats) >= 2:
            p1 = _phrase(meaningful_feats[0]["feature"], meaningful_feats[0]["value"], is_first=True)
            p2 = _phrase(meaningful_feats[1]["feature"], meaningful_feats[1]["value"], is_first=False)
            summary = f"{p1} and {p2} indicate a likely {incident_type} incident"
        elif len(meaningful_feats) == 1:
            p1 = _phrase(meaningful_feats[0]["feature"], meaningful_feats[0]["value"], is_first=True)
            summary = f"{p1} indicates a likely {incident_type} incident"
        else:
            summary = f"Telemetry metrics indicate a likely {incident_type} incident"

        return {
            "incident_type": incident_type,
            "confidence": confidence,
            "top_features": top_features,
            "summary": summary,
        }

    # ── Persistence helpers ──────────────────────────────────────────────
    def load(self) -> bool:
        """Load a previously saved model. Returns True on success."""
        if os.path.exists(MODEL_PATH):
            self.model = joblib.load(MODEL_PATH)
            self._is_trained = True
            logger.info("XGBoost classifier loaded from disk")
            return True
        logger.warning("No saved XGBoost classifier found")
        return False

    @property
    def is_trained(self) -> bool:
        return self._is_trained
