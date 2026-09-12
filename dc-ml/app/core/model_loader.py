import json
from pathlib import Path
from typing import Optional, Dict, Any
import joblib
import torch
from loguru import logger
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler, LabelEncoder
from xgboost import XGBClassifier

from app.models.lstm_forecaster import BiLSTMForecaster

# Dynamically locate saved_models directory across different execution contexts
POSSIBLE_DIRS = [
    Path("saved_models"),
    Path("dc-ml/saved_models"),
    Path(__file__).resolve().parent.parent.parent / "saved_models",
    Path(__file__).resolve().parent.parent.parent.parent / "dc-ml" / "saved_models",
]

MODELS_DIR = Path("saved_models")
for d in POSSIBLE_DIRS:
    if d.exists() and (d / "isolation_forest.pkl").exists():
        MODELS_DIR = d
        break


class ModelLoader:
    """
    Singleton model loader that loads all trained models,
    scalers, and metadata from saved_models/ on startup.
    """
    def __init__(self):
        self.isolation_forest: Optional[IsolationForest] = None
        self.if_scaler: Optional[StandardScaler] = None
        self.xgboost_model: Optional[XGBClassifier] = None
        self.xgb_encoder: Optional[LabelEncoder] = None
        self.xgb_scaler: Optional[StandardScaler] = None
        self.bilstm_model: Optional[BiLSTMForecaster] = None
        self.lstm_scaler: Optional[Any] = None
        self.combined_metrics: Dict[str, Any] = {}
        self._is_loaded: bool = False

    def load_all(self):
        logger.info(f"Loading VaultWatch ML model artifacts from '{MODELS_DIR.resolve()}'...")

        # 1. Isolation Forest
        try:
            if_path = MODELS_DIR / "isolation_forest.pkl"
            if not if_path.exists():
                if_path = MODELS_DIR / "isolation_forest.joblib"
            self.isolation_forest = joblib.load(if_path)
            self.if_scaler = joblib.load(MODELS_DIR / "if_scaler.pkl")
            logger.info("✓ Loaded Isolation Forest model and scaler")
        except Exception as e:
            logger.error(f"Failed to load Isolation Forest: {e}")

        # 2. XGBoost Classifier
        try:
            xgb_path = MODELS_DIR / "xgboost_model.pkl"
            if not xgb_path.exists():
                xgb_path = MODELS_DIR / "xgboost_classifier.joblib"
            self.xgboost_model = joblib.load(xgb_path)
            self.xgb_scaler = joblib.load(MODELS_DIR / "xgb_scaler.pkl")
            self.xgb_encoder = joblib.load(MODELS_DIR / "xgb_encoder.pkl")
            logger.info("✓ Loaded XGBoost model, scaler, and label encoder")
        except Exception as e:
            logger.error(f"Failed to load XGBoost Classifier: {e}")

        # 3. Bi-LSTM Forecaster
        try:
            bilstm_path = MODELS_DIR / "bilstm_model.pt"
            if not bilstm_path.exists():
                bilstm_path = MODELS_DIR / "lstm_forecaster.pt"
            checkpoint = torch.load(bilstm_path, map_location="cpu")

            self.bilstm_model = BiLSTMForecaster(
                input_size=checkpoint.get("input_size", 6),
                hidden_size=checkpoint.get("hidden_size", 128),
                num_layers=checkpoint.get("num_layers", 2),
                output_steps=checkpoint.get("output_steps", 10),
                output_features=checkpoint.get("output_features", 2),
                dropout=0.3,
            )
            self.bilstm_model.load_state_dict(checkpoint["model_state_dict"])
            self.bilstm_model.eval()

            self.lstm_scaler = joblib.load(MODELS_DIR / "lstm_scaler.pkl")
            logger.info("✓ Loaded Bi-LSTM with Temporal Attention model and scaler")
        except Exception as e:
            logger.error(f"Failed to load Bi-LSTM Forecaster: {e}")

        # 4. Combined Metrics Metadata
        try:
            metrics_path = MODELS_DIR / "combined_metrics.json"
            if metrics_path.exists():
                with open(metrics_path, "r", encoding="utf-8") as f:
                    self.combined_metrics = json.load(f)
                logger.info("✓ Loaded combined training evaluation metrics")
        except Exception as e:
            logger.warning(f"Failed to load combined_metrics.json: {e}")

        self._is_loaded = self.is_ready()
        if self._is_loaded:
            logger.info("🚀 All 3 VaultWatch ML models loaded and ready for production inference")
        else:
            logger.warning("⚠️ Some ML models failed to load. Operating in calibrated fallback mode.")

    def is_ready(self) -> bool:
        """Return True if all models loaded successfully"""
        return (
            self.isolation_forest is not None
            and self.xgboost_model is not None
            and self.bilstm_model is not None
        )


model_loader = ModelLoader()
