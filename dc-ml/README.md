# dc-ml (legacy research models and datasets)

**The product no longer uses the models in this folder.** The model VaultWatch runs is trained and served from
`dc-backend/app/ml/` (see `dc-backend/app/ml/artifacts/MODEL_CARD.md`). This folder keeps the datasets that training reads.

## Why the earlier models were retired (audit, October 2026)

- `datasets/processed/*.csv` mix one real metric per series with columns generated from it: RAM, temperature and disk usage
  were synthesized from CPU plus random noise.
- The "incident type" labels were threshold rules on those same columns (for example `cpu_pct > 85` → `cpu_spike`), and
  `thermal_event` was simply NAB's anomaly window renamed. The XGBoost classifier learned those rules back, so its 85.7% F1
  says nothing about real incidents.
- Rows were shuffled before the train/test split, so neighbouring 5-minute readings from the same server were on both sides
  (leakage). The Isolation Forest's "87.8% accuracy" came from that split.
- There are no future-failure labels, so the Bi-LSTM "forecast" could not be validated as incident prediction.

## What is still used

- `datasets/nab/*.csv` and `datasets/nab/combined_windows.json`: real AWS CloudWatch series and NAB's human-labeled anomaly
  windows. `python -m app.ml.training.train` (in dc-backend) reads only these.
- `scripts/download_datasets.py` (repo root) fetches them again if needed.

The FastAPI service in `app/`, the saved models in `saved_models/` and `scripts/train_all_models.py` / `scripts/preprocess_data.py`
are kept for reference only and are not started by docker compose.
