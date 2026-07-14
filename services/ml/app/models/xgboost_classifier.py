"""
XGBoost multi-class classifier for incident-type prediction.

Maps metric feature vectors to one of six incident categories:
  cpu_spike | memory_leak | disk_failure |
  network_anomaly | thermal_event | predicted_outage
"""

import os
import numpy as np
import joblib
import mlflow
from xgboost import XGBClassifier
from loguru import logger

from app.utils.preprocessor import INCIDENT_TYPES, IDX_TO_INCIDENT_TYPE

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "saved_models")
MODEL_PATH = os.path.join(MODEL_DIR, "xgboost_classifier.joblib")

NUM_CLASSES = len(INCIDENT_TYPES)


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
