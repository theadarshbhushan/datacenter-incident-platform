from typing import Dict, Any, List, Optional
from loguru import logger

from app.models.isolation_forest import IsolationForestDetector
from app.models.xgboost_classifier import XGBoostClassifier
from app.models.lstm_forecaster import LSTMForecasterService


RECOMMENDATIONS = {
    "cpu_spike": "Reduce workload, check processes",
    "memory_leak": "Restart services, check heap",
    "disk_failure": "Run disk diagnostics immediately",
    "network_anomaly": "Check network interfaces",
    "thermal_event": "Check cooling systems",
    "normal": "Telemetry nominal; maintain standard operational monitoring.",
}


class EnsemblePredictor:
    """
    Weighted Ensemble Predictor combining:
    - Isolation Forest: 0.35
    - XGBoost Classifier: 0.40
    - Bi-LSTM Forecaster: 0.25

    Flags alert only if ensemble_score > 0.65.
    """
    def __init__(self):
        self.if_detector = IsolationForestDetector()
        self.xgb_classifier = XGBoostClassifier()
        self.lstm_forecaster = LSTMForecasterService()

    def predict(
        self,
        server_id: str,
        metrics: Dict[str, Any],
        history: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        # 1. Isolation Forest Evaluation
        if_res = self.if_detector.predict(metrics)
        if_score = float(if_res.get("anomaly_score", 0.0))
        if_is_anomaly = bool(if_res.get("is_anomaly", False))

        # 2. XGBoost Evaluation & SHAP Explanation
        xgb_res = self.xgb_classifier.predict(metrics)
        shap_res = self.xgb_classifier.explain(metrics)

        incident_type = xgb_res.get("incident_type", "normal")
        xgb_conf = float(xgb_res.get("confidence", 0.5))

        if incident_type != "normal":
            xgb_score = xgb_conf
            xgb_is_anomaly = True
        else:
            xgb_score = max(0.05, 1.0 - xgb_conf)
            xgb_is_anomaly = False

        # 3. Bi-LSTM Temporal Attention Forecasting
        history_seq = history if history else [metrics]
        lstm_res = self.lstm_forecaster.predict(history_seq)

        lstm_is_anomaly = bool(lstm_res.get("alert", False))
        peak_cpu = float(lstm_res.get("peak_cpu", 50.0))
        lstm_score = min(1.0, max(0.0, peak_cpu / 100.0))
        if lstm_is_anomaly:
            lstm_score = max(0.75, lstm_score)

        # 4. Weighted Voting Calculation
        # IF: 0.35, XGBoost: 0.40, LSTM: 0.25
        ensemble_score = round(
            (if_score * 0.35) + (xgb_score * 0.40) + (lstm_score * 0.25),
            4,
        )

        # Alert triggered only if ensemble_score > 0.65
        is_anomaly = bool(ensemble_score > 0.65)

        # Model agreement count (0 - 3)
        agreement_count = sum([1 if if_is_anomaly else 0, 1 if xgb_is_anomaly else 0, 1 if lstm_is_anomaly else 0])

        # Confidence level
        if ensemble_score >= 0.80:
            confidence_level = "high"
        elif ensemble_score >= 0.65:
            confidence_level = "medium"
        else:
            confidence_level = "low"

        recommendation = RECOMMENDATIONS.get(
            incident_type, "Inspect server diagnostics and system metrics log."
        )

        logger.info(
            f"Ensemble on {server_id}: score={ensemble_score} (anomaly={is_anomaly}), "
            f"type={incident_type}, agreement={agreement_count}/3"
        )

        return {
            "server_id": server_id,
            "is_anomaly": is_anomaly,
            "ensemble_score": ensemble_score,
            "confidence": confidence_level,
            "incident_type": incident_type if is_anomaly else "normal",
            "model_agreement": agreement_count,
            "shap_explanation": shap_res,
            "forecast": lstm_res,
            "recommendation": recommendation if is_anomaly else RECOMMENDATIONS["normal"],
        }
