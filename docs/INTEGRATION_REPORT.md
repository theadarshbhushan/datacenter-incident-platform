# Backend, ML and full-stack integration report (October 2026)

Every number in this report was produced by the commands listed under "Tests executed".

## 1. Audit findings

- **Auth.** Cookie sessions, CSRF, email verification, password reset, roles and invitations were already real and tested. They were kept.
- **Workspace data.** Servers, racks, predictions and alert rules were embedded in a single `org_workspaces` document. Predictions were sample data, alert rules were never evaluated, and ingested telemetry never reached a model.
- **Frontend charts in live mode.** Dashboard and incident charts drew generated curves even with the real backend.
- **ML data.** Only CPU, disk writes and network in were real measurements, one per series. RAM, temperature and disk usage were synthesized from CPU. Class labels were threshold rules on those same columns. Rows were randomly shuffled before the split (leakage). The reported 87.8% and 85.7% scores were therefore not meaningful.
- **Legacy pipeline.** The Kafka, Celery and `/servers`/`/incidents` internal routes were pipeline-wide rather than scoped to an organization.

## 2. Backend files

- **New:**
  - `app/models/monitoring.py`
  - `app/migrations/` (runner and 3 migrations)
  - `app/ml/` (`features.py`, `trees.py`, `inference.py`, `diagnostics.py`, `training/train.py`, `artifacts/`)
  - Services: `telemetry`, `pipeline`, `incidents`, `alerts`, `reports`, `demo`, `infrastructure`
  - Routers: `telemetry`, `infrastructure`, `incidents`, `predictions`, `alerts`, `reports`, `system`
  - `schemas/monitoring.py`, `core/timeutil.py`
  - `tests/test_monitoring.py`
  - `requirements-ml.txt`, `.dockerignore`
- **Modified:** `main.py` (model loaded once at startup, readiness), `config.py`, `database.py` (migrations at startup), `auth.py`, `permissions.py` (`predictions:run`), `models/account.py`, routers `auth` and `workspace`, `services/workspace.py`, `schemas/workspace.py`, `websocket/manager.py`, `requirements.txt`, tests.
- **Removed:**
  - Legacy models: `server`, `metric`, `incident`, `alert`
  - Internal routers: `servers`, `metrics`, `incidents`, `predictions`, `analytics`, `alerts`, `ingest`
  - Celery worker
  - `dc-ingestion/producer.py`, replaced by `agent.py`

## 3. Database

MongoDB is kept. The new collections are:

- `data_centers`, `racks`, `infra_servers`
- `telemetry` (time series, 90-day expiry) and `telemetry_buckets` (5-minute rollups)
- `predictions`, `ml_models`
- `alert_rules`, `notifications`
- `ingest_stats`, `counters`, `schema_migrations`

Incidents and alerts gained indexed top-level fields (status, severity, dedup key, demo flag). There are three migrations:

| Migration | What it does |
| --- | --- |
| `0001` | Baseline |
| `0002` | Backfills incident and alert fields |
| `0003` | Moves the embedded workspace arrays and legacy agent servers/metrics into the new collections |

They were run on legacy-format data in a real MongoDB 8.2. A second run applied nothing.

## 4. API endpoints

All endpoints are under `/api/v1`:

- **Telemetry:** `POST /telemetry/ingest`, `GET /telemetry/health`
- **Inventory:** `GET /infrastructure`; CRUD for `/datacenters`, `/racks`, `/servers`
- **Metrics:** `GET /servers/{id}/metrics`, `GET /metrics/fleet`
- **Incidents:** `GET`/`POST /incidents`, `GET`/`PATCH /incidents/{id}`, `POST /incidents/{id}/actions`
- **Predictions:** `GET /predictions`, `POST /predictions/run`, `GET /predictions/{id}`, `GET /ml/status`
- **Alerts:** `GET /alerts`, `POST /alerts/{id}/actions`, `/alert-rules`, `/notification-settings`, `GET /notifications`
- **Reports:** `GET /reports/summary`
- **Health:** `GET /health/ready`, `GET /integrations/status`
- **Sample data:** `DELETE /workspace/sample-environment`

The existing auth, onboarding, team and workspace endpoints are kept.

## 5. ML: retained approach, retrained model

- **Anomaly detection.** The Isolation Forest approach was kept and retrained on real NAB data only, with causal, scale-free features.
- **Retired.** The XGBoost classifier and Bi-LSTM forecaster were retired, because their targets were synthetic.
- **Added.** An experimental early-warning classifier, chosen from logistic regression, random forest and gradient boosting.
- **Artifact format.** Models are exported as JSON and scored with numpy. Pickles are not used. Training verifies that the numpy scores equal scikit-learn's.

Held-out results (leave-one-server-out, 8 series, 32,964 buckets, 11 labeled windows):

| Detector | Operating point | Precision | Recall | Windows caught | False alarm episodes / server / day |
| --- | --- | --- | --- | --- | --- |
| Isolation Forest | Alert rule (15 min) | 0.535 | 0.033 | 6/11 | 0.336 |
| Robust z-score baseline | Alert rule (15 min) | 0.401 | 0.026 | 7/11 | 0.628 |

- **Pooled PR-AUC:** 0.179 for the Isolation Forest, 0.154 for the z-score baseline, against a 0.099 base rate.
- **Early warning:** random forest on a chronological split. Test PR-AUC is 0.249 against a 0.074 base rate, the Brier skill score is 0.174, and calibration error is 0.034, so it is shown as a probability.
- **Caveat:** the feature scaling was chosen on the same evaluation data, so treat these numbers as slightly optimistic.
- **Full details:** `dc-backend/app/ml/artifacts/MODEL_CARD.md` and `evaluation.json`.

## 6. Frontend integration

- **New endpoints.** A central API layer (`services/api.ts` + `httpApi.ts`) adds metrics, incident context, reports, prediction runs, integration status and sample removal.
- **Session expiry.** A 401 outside the auth flows signs the user out and returns them to the login page.
- **Pages:**
  - **Dashboard:** real fleet metrics, and a monitoring status that reads Live / Stale / Waiting / Sample.
  - **Incident detail:** real metrics, correlated alerts, and suspected vs confirmed root cause with a confirm action.
  - **Predictions:** rebuilt around the anomaly score, the experimental early warning, severity and confidence.
  - **Infrastructure:** missing readings show as "—", never 0.
  - **Reports:** figures are computed by the server.
  - **Integrations:** telemetry health and the status of the database, model, email and notification channels.
  - **Settings:** removes sample data.
- **Browser-only demo mode** (`VITE_API_MODE=mock`) still works and uses the new shapes. It is labeled "no model runs".
- **Marketing copy** no longer claims failure prediction or "probability with confidence".

## 7. Environment variables

See `.env.example`. Required: `SECRET_KEY` and `MONGO_URI` (Atlas or local). Optional:

- `EMAIL_BACKEND` / `SMTP_*`
- `SLACK_WEBHOOK_URL`, `PAGERDUTY_ROUTING_KEY`
- `ML_MODEL_PATH`
- `RUN_MIGRATIONS_ON_STARTUP`
- `DEMO_SEED_HOURS`
- `AGENT_API_KEY` (agent profile)
- `MONGO_ROOT_PASSWORD` (local-db profile)
- `GRAFANA_ADMIN_PASSWORD` (observability profile)

## 8. Commands

See the "Run it" section of `README.md`:

- `docker compose up --build`, with `--profile local-db`, `--profile agent` or `--profile observability` as needed
- `python -m app.migrations upgrade`
- `python -m app.ml.training.train`
- `python agent.py`

## 9. Tests executed

| Test | Result |
| --- | --- |
| `pytest` in `dc-backend` (Python 3.14, local libraries) | 32 passed |
| `pytest` with the pinned `requirements-dev.txt` (Python 3.11, same as the Docker image) | 32 passed |
| `npm run typecheck` and `npm run build` | pass |
| End-to-end script through the Vite proxy against FastAPI and a real MongoDB 8.2 (covers acceptance items 1–12 plus demo separation) | 30/30 checks passed |
| Browser check (built-in browser) | Live organization: dashboard, incident detail, AI analysis, predictions, reports, infrastructure and alerts render real data. Demo organization: labeled sample data. |
| Migrations on legacy-format documents | Applied once, idempotent |
| Retraining with pinned `requirements-ml.txt` (Python 3.11) | Same alert-rule results; other figures within about 0.01 |
| `docker compose config` | Valid for the default, local-db, agent and observability profiles. The images were not built, because Docker Desktop was not running. |

## 10. Remaining limitations

- No log integration and no cloud connectors (CloudWatch, Azure, Prometheus, Redfish).
- Google sign-in and billing are not implemented.
- Email, Slack and PagerDuty deliver only when configured.
- Inlet temperature is not measured.
- Memory, temperature, power and latency anomalies are unvalidated.
- No failure-prediction labels exist.
- The rate limiter is in-process.
- Docker images were not built in this run.
