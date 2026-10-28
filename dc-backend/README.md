# VaultWatch API (FastAPI + MongoDB)

## Run

```bash
python -m venv .venv && . .venv/bin/activate      # Python 3.11+  (Windows: .venv\Scripts\activate)
pip install -r requirements-dev.txt
# MONGO_URI comes from ../.env: an Atlas mongodb+srv:// URI or mongodb://localhost:27017
python -m app.migrations upgrade                   # optional: the API also applies pending migrations at startup
uvicorn app.main:app --reload --port 8000          # docs at http://localhost:8000/docs (development only)
pytest                                             # in-memory MongoDB + the real model artifact, no services needed
```

Health: `GET /health` (process up), `GET /api/v1/health/ready` (database reachable and model loaded; 503 otherwise),
`GET /api/v1/ml/status` (model version, thresholds, evaluation summary).

## Layout

| Path | Purpose |
| --- | --- |
| `app/core/` | Config, cookie sessions + CSRF (`auth.py`), role matrix (`permissions.py`), rate limits, mailer, UTC helpers |
| `app/models/account.py` | Users' organizations, memberships, invitations, tokens, sessions, API keys, incidents, alerts, settings |
| `app/models/monitoring.py` | Data centers, racks, servers, raw telemetry (time series), 5-minute buckets, predictions, model records, alert rules, notifications |
| `app/migrations/` | Versioned data migrations (`python -m app.migrations status` or `upgrade`) |
| `app/routers/` | HTTP only: validation, permissions, response shape |
| `app/services/` | Business logic: `telemetry` (ingest), `pipeline` (inference flow), `incidents` (dedup/correlation), `alerts` (rules, notifications), `reports`, `demo`, `infrastructure` |
| `app/ml/` | `features.py` (shared by training and serving), `inference.py` (loaded once), `diagnostics.py` (root-cause rules), `trees.py` (numpy scorer), `training/` |
| `app/ml/artifacts/` | `model_bundle.json.gz`, `evaluation.json`, `MODEL_CARD.md` |

## Inference flow

`POST /api/v1/telemetry/ingest` (API key) → validation (ranges, timezone-aware timestamps no older than 24 h and at most 5 min ahead)
→ raw point + 5-minute bucket in MongoDB → when a bucket completes: features over the last 24 h → Isolation Forest + experimental
early warning → predictions stored (log + current) → server assessment → alerts (one per condition, auto-cleared) → automatic
incidents (deduplicated per server and category, correlated per rack, reopened within 30 min) → websocket event to the org.

## API (all under /api/v1, organization-scoped)

| Area | Endpoints |
| --- | --- |
| Telemetry | `POST /telemetry/ingest` (API key; one point or `{points: [...]}`), `GET /telemetry/health`, legacy `POST /metrics` |
| Infrastructure | `GET /infrastructure`, `GET/POST /servers`, `GET/PATCH/DELETE /servers/{id}`, `GET /servers/{id}/metrics`, `GET /metrics/fleet`, `POST/PATCH/DELETE /datacenters`, `/racks` |
| Incidents | `GET/POST /incidents`, `GET/PATCH /incidents/{id}`, `POST /incidents/{id}/actions` |
| Predictions | `GET /predictions` (`?history=true` for the log), `POST /predictions/run`, `GET /predictions/{id}`, `GET /ml/status` |
| Alerts | `GET /alerts`, `POST /alerts/{id}/actions`, `GET/PUT/DELETE /alert-rules/{id}`, `PUT /notification-settings`, `GET /notifications` |
| Reports | `GET /reports/summary?start=&end=` |
| System | `GET /health/ready`, `GET /integrations/status` |
| Accounts | `/auth/*`, `/invitations/*`, `/me/*`, `/orgs/switch`, `/onboarding/*`, `/org`, `/team/*`, `/api-keys`, `GET /workspace` |

Responses use `{success, data, message, timestamp}`; errors add a stable `code` and per-field `fields`.

## Retraining the model

```bash
pip install -r requirements-ml.txt
python -m app.ml.training.train          # reads ../dc-ml/datasets/nab, writes app/ml/artifacts/
```

Restart the API to load the new bundle (or set `ML_MODEL_PATH`). See `app/ml/artifacts/MODEL_CARD.md` for data, evaluation and limitations.
