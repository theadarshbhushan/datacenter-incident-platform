# VaultWatch ML Service

Production-grade machine learning inference service for the VaultWatch Data Center Incident Prediction Platform.

## Models
- **Isolation Forest**: Unsupervised real-time telemetry anomaly detection (87.8% accuracy)
- **XGBoost + SHAP**: Multivariate 6-class failure root cause classification with TreeExplainer feature attributions (85.7% weighted F1)
- **Bi-LSTM + Temporal Attention**: Multi-step forward CPU & RAM forecast sequence generator (MAE: 6.77%)

## Architecture & Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Model readiness, dataset metadata, and benchmark training evaluation metrics |
| `POST` | `/anomaly/detect` | Combined Isolation Forest + XGBoost prediction with SHAP top feature drivers |
| `POST` | `/forecast/predict` | 10-step Bi-LSTM predictive sequence with temporal attention weights |
| `POST` | `/ensemble/predict` | Weighted consensus prediction (IF: 0.35, XGB: 0.40, LSTM: 0.25) with SRE recommendations |
| `GET` | `/docs` | Interactive Swagger UI API documentation |

## Quick Start

```bash
cd dc-ml
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
uvicorn app.main:app --reload --port 8001
```

## Model Training & Artifact Generation

To retrain all three models from processed datasets and output new artifacts into `saved_models/`:

```bash
python ../scripts/train_all_models.py
```
