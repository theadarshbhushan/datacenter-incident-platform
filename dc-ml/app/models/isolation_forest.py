"""
Isolation Forest anomaly detector.

Wraps scikit-learn's IsolationForest to provide train / predict
methods that return anomaly scores scaled to [0, 1] and a boolean
is_anomaly flag.
"""

import os
import numpy as np
import joblib
import mlflow
from sklearn.ensemble import IsolationForest
from loguru import logger

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "saved_models")
MODEL_PATH = os.path.join(MODEL_DIR, "isolation_forest.joblib")


class AnomalyDetector:
    """Thin wrapper around scikit-learn IsolationForest."""

    def __init__(self):
        self.model: IsolationForest | None = None
        self._is_trained = False

    # ── Training ─────────────────────────────────────────────────────────
    def train(
        self,
        X: np.ndarray,
        contamination: float = 0.05,
        n_estimators: int = 200,
        random_state: int = 42,
    ) -> dict:
        """
        Fit an IsolationForest on *X* (shape N×F) and persist to disk.

        Returns a summary dict with training metadata.
        """
        logger.info(
            f"Training IsolationForest — samples={X.shape[0]}, "
            f"features={X.shape[1]}, contamination={contamination}"
        )

        self.model = IsolationForest(
            n_estimators=n_estimators,
            contamination=contamination,
            random_state=random_state,
            n_jobs=-1,
        )
        self.model.fit(X)
        self._is_trained = True

        # Persist
        os.makedirs(MODEL_DIR, exist_ok=True)
        joblib.dump(self.model, MODEL_PATH)
        logger.info(f"Isolation Forest saved to {MODEL_PATH}")

        # MLflow logging (best-effort)
        try:
            mlflow.log_params({
                "if_n_estimators": n_estimators,
                "if_contamination": contamination,
                "if_n_samples": X.shape[0],
                "if_n_features": X.shape[1],
            })
        except Exception as e:
            logger.warning(f"MLflow logging skipped: {e}")

        return {
            "model": "isolation_forest",
            "n_samples": int(X.shape[0]),
            "n_features": int(X.shape[1]),
            "contamination": contamination,
            "n_estimators": n_estimators,
        }

    # ── Inference ────────────────────────────────────────────────────────
    def predict(self, X: np.ndarray) -> dict:
        """
        Score a set of observations.

        Parameters
        ----------
        X : ndarray of shape (N, F)

        Returns
        -------
        dict with keys:
            anomaly_score : float — average anomaly score in [0, 1]
                            (higher → more anomalous).
            is_anomaly    : bool  — True when the average score exceeds
                            the detection threshold.
        """
        if not self._is_trained or self.model is None:
            raise RuntimeError("Model has not been trained yet")

        # decision_function returns negative scores for anomalies
        raw_scores = self.model.decision_function(X)
        predictions = self.model.predict(X)  # +1 normal, -1 anomaly

        # Map raw score → [0, 1] where 1 = very anomalous
        # decision_function: negative = anomaly, positive = normal
        # We negate and clip, then scale by a reasonable range
        anomaly_scores = -raw_scores
        # Normalise into [0, 1] using min-max over the batch
        s_min, s_max = anomaly_scores.min(), anomaly_scores.max()
        if s_max - s_min > 1e-9:
            anomaly_scores = (anomaly_scores - s_min) / (s_max - s_min)
        else:
            anomaly_scores = np.where(predictions == -1, 0.8, 0.2)

        avg_score = float(np.mean(anomaly_scores))
        # Use scikit-learn's own threshold: any sample labelled -1
        is_anomaly = bool(np.any(predictions == -1))

        return {
            "anomaly_score": round(avg_score, 4),
            "is_anomaly": is_anomaly,
        }

    # ── Persistence helpers ──────────────────────────────────────────────
    def load(self) -> bool:
        """Load a previously saved model. Returns True on success."""
        if os.path.exists(MODEL_PATH):
            self.model = joblib.load(MODEL_PATH)
            self._is_trained = True
            logger.info("Isolation Forest loaded from disk")
            return True
        logger.warning("No saved Isolation Forest found")
        return False

    @property
    def is_trained(self) -> bool:
        return self._is_trained
