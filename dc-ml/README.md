# dc-ml (retired)

**The product does not use anything from this folder.** The model VaultWatch runs is trained and served from
`dc-backend/app/ml/` (see `dc-backend/app/ml/artifacts/MODEL_CARD.md`). The datasets, the old models and their FastAPI service
were removed in November 2026. They remain in git history.

## Why the earlier models were retired (audit, October 2026)

- `datasets/processed/*.csv` mixed one real metric per series with columns generated from it: RAM, temperature and disk usage
  were synthesized from CPU plus random noise.
- The "incident type" labels were threshold rules on those same columns (for example `cpu_pct > 85` → `cpu_spike`), and
  `thermal_event` was simply NAB's anomaly window renamed. The XGBoost classifier learned those rules back, so its 85.7% F1
  says nothing about real incidents.
- Rows were shuffled before the train/test split, so neighbouring 5-minute readings from the same server were on both sides
  (leakage). The Isolation Forest's "87.8% accuracy" came from that split.
- There are no future-failure labels, so the Bi-LSTM "forecast" could not be validated as incident prediction.

## Retraining

`python -m app.ml.training.train` (in dc-backend) reads `datasets/nab/*.csv` and `datasets/nab/combined_windows.json`: real AWS
CloudWatch series and NAB's human-labeled anomaly windows. Run `python scripts/download_datasets.py` from the repo root first to
fetch them into this folder. git ignores `datasets/`.
