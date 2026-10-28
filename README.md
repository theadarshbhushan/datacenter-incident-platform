# VaultWatch

VaultWatch monitors data center servers, detects anomalies in their telemetry, and manages the incidents that follow. It has:

- a public marketing site,
- account flows (sign up, verify email, reset password, invitations),
- onboarding that creates an organization,
- an organization workspace: dashboard, incidents, predictions, infrastructure, reports, alerts, team, settings, billing and integrations.

| Folder | What it is |
| --- | --- |
| `dc-frontend/` | React 18 + TypeScript + Vite + Tailwind single-page app |
| `dc-backend/` | FastAPI + MongoDB API: accounts and sessions, organizations and roles, infrastructure, telemetry ingestion, ML inference, incidents, alerts, reports. See `dc-backend/README.md`. |
| `dc-backend/app/ml/` | The model: features, training and evaluation, inference, root-cause rules. Results are in `artifacts/MODEL_CARD.md`. |
| `dc-ingestion/` | Telemetry agent: sends this machine's real metrics, or a simulated fleet for testing |
| `dc-ml/` | Datasets used for training, plus the retired research models (see `dc-ml/README.md` for why they were retired) |
| `infra/` | Optional Prometheus and Grafana |

## Run it

### 1. Everything with Docker (database on MongoDB Atlas)

```bash
cp .env.example .env
# Fill in SECRET_KEY and MONGO_URI (your Atlas connection string). Everything else has a working default.
docker compose up --build
```

- App: http://localhost:5173. API docs: http://localhost:8000/docs (development only).
- Readiness: http://localhost:8000/api/v1/health/ready returns 200 only when the database is reachable and the model is loaded.
- Pending database migrations run when the API starts.
- In development, emails (verification, reset, invitations) are not sent. They are listed at http://localhost:5173/api/v1/dev/mail. Set `EMAIL_BACKEND=smtp` and the `SMTP_*` values to send real email.
- No Atlas? Use a local MongoDB container: set `MONGO_ROOT_PASSWORD` and `MONGO_URI=mongodb://vaultwatch:<that password>@mongodb:27017/?authSource=admin`, then run `docker compose --profile local-db up --build`.

### 2. Without Docker

```bash
# backend (Python 3.11+)
cd dc-backend
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m app.migrations upgrade
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd dc-frontend
npm install
echo "VITE_API_MODE=api" > .env.local
npm run dev                                          # Vite proxies /api to :8000, so cookies stay first-party
```

### 3. Browser-only demo (no backend)

`cd dc-frontend && npm install && npm run dev` with no `.env.local`. `VITE_API_MODE` defaults to `mock`. Every page shows a demo banner. Accounts live in the browser. Sign in as `owner@vaultwatch.dev`, `admin@`, `engineer@` or `viewer@` with the password `Demo@12345`. **No model runs in this mode.**

### Send telemetry

1. In the app, open **Integrations** and click **Create key** with the `metrics:write` scope.
2. Then run the agent:

```bash
cd dc-ingestion && pip install -r requirements.txt
VAULTWATCH_URL=http://localhost:8000 VAULTWATCH_API_KEY=vw_live_... python agent.py
```

The dashboard says **Live** only after real telemetry arrives. The model scores a server once it has 4 hours of history. For a quick trial, use a separate test organization and run `python agent.py --simulate 6 --backfill-hours 6 --spike-after-min 10`.

### Checks

```bash
cd dc-backend  && pytest                               # 32 API tests (in-memory MongoDB, real model artifact)
cd dc-frontend && npm run typecheck && npm run build
```

## Demo mode and live mode

| | Demo (sample environment) | Live |
| --- | --- | --- |
| Servers and telemetry | 40 sample servers. Synthetic 5-minute telemetry with a few injected problems, extended as you use it. | Whatever your agents send to `POST /api/v1/telemetry/ingest`, authenticated with an API key |
| Predictions, alerts, incidents | Produced by the **real model and pipeline** running on the synthetic telemetry. Resolved history is sample text. | Produced by the same model and pipeline from your telemetry |
| Labeling | Every sample row is flagged `sample` and the UI labels it | Not flagged |
| Separation | Loading sample data is refused once real servers exist. The first real telemetry removes all sample rows. **Settings → Remove sample data** removes them by hand. | |
| Monitoring status | "Sample telemetry" | "Live" only when telemetry arrived in the last 5 minutes. Otherwise "No telemetry since …" or "Waiting for telemetry". |

## The model, honestly

- **Anomaly detection (used for alerts and incidents).** An Isolation Forest scores each metric of each server against that server's own 24-hour baseline. It was trained on 8 real AWS CloudWatch series from the Numenta Anomaly Benchmark (32,964 five-minute readings, 11 human-labeled anomaly windows) and evaluated by holding out one server at a time.
- **Alert rule results.** An alert fires when a metric is above the warning threshold for 15 minutes and critical at least once. On held-out servers this caught **6 of 11** labeled windows, with precision **0.54** and **0.34 false alarm episodes per server per day**. Pooled PR-AUC is 0.179, against 0.154 for a z-score baseline and a 0.099 base rate.
- **Selection caveat.** The feature scaling was chosen after comparing two variants on these same results, so the numbers are slightly optimistic.
- **Early warning (experimental).** This predicts that a metric's 15-minute average jumps more than 4 robust standard deviations above its baseline within the next hour.
  - The model is a random forest, chosen on a chronological validation split.
  - On the test split: PR-AUC **0.249** vs a 0.074 base rate, and a Brier skill score of 0.17.
  - It passed the calibration check (calibration error 0.034), so it is shown as a probability.
  - It is **not** a hardware-failure forecast.
- **No failure prediction is claimed.** The data has no labels for disk failures or overheating, so VaultWatch does not claim to predict those. Memory, temperature, power and latency are scored with the same scale-free features, but they were not in the labeled data, so their results show lower confidence.
- **Scores are kept separate.** The anomaly score (a percentile, not a probability), probability, severity (from fixed thresholds) and confidence (how much history backs the result) are separate fields in the API and the UI.
- **Root-cause assistance** uses explainable rules over per-metric scores, rack-mates, correlated alerts and incident history. Its answer is always "suspected" until someone on your team confirms the cause on the incident. No LLM is involved.
- **Earlier models.** The XGBoost, Bi-LSTM and old Isolation Forest results in `dc-ml/` came from synthetic columns, rule-generated labels and a shuffled split, and are no longer used. `dc-ml/README.md` explains why.

## Database

MongoDB is kept: it fits the data, and the authentication work already used it. MongoDB has no foreign keys, so the service layer checks every reference against the caller's organization, and compound indexes enforce uniqueness. Migrations live in `dc-backend/app/migrations/` and are recorded in `schema_migrations`. Run `python -m app.migrations status` or `python -m app.migrations upgrade`.

| Collection | Holds | Key indexes |
| --- | --- | --- |
| `users`, `organizations`, `memberships`, `invitations`, `auth_tokens`, `user_sessions`, `api_keys` | Accounts, roles, hashed tokens and keys | unique email, (org, user), token hashes; TTL on sessions and tokens |
| `data_centers`, `racks`, `infra_servers` | Inventory | (org, dc, label) unique; (org, agent_id) unique |
| `telemetry` | Raw readings (time-series collection, 90-day expiry) | (org, server, ts) |
| `telemetry_buckets` | 5-minute rollups used by charts and the model | (org, server, start) unique; 90-day TTL |
| `predictions`, `ml_models` | Prediction log (with `current` flag) and the model versions served | (org, current, time); (org, server, kind, time); 90-day TTL |
| `workspace_incidents`, `workspace_alerts` | Incidents (timeline = history) and alerts, with dedup keys | (org, id) unique; (org, status, dedup_key) |
| `alert_rules`, `notifications`, `org_workspaces` | Rules, the delivery log, notification and monitoring settings | (org, position); (org, time) |
| `ingest_stats`, `audit_log`, `counters`, `schema_migrations` | Ingestion health, audit trail, incident numbering, migrations | |

All timestamps are stored in UTC. Every query filters by the organization of the caller's verified membership, or of the API key.

## Security model (summary)

- **Sessions.** An HttpOnly session cookie, with only its SHA-256 hash stored in the database. A signed double-submit CSRF token protects cookie-authenticated writes. Writes from origins outside `CORS_ORIGINS` are refused.
- **Single-use tokens.** Reset tokens last 30 minutes, verification tokens 24 hours and invitations 7 days. All are stored hashed. A password reset ends the user's other sessions.
- **Rate limits.** Sign-in, signup, password reset, invitations, contact and per-API-key ingestion are rate limited. The limiter is in memory, so run one API worker or move it to Redis before scaling out.
- **Telemetry.** Ingestion needs an organization API key with `metrics:write`. Browser sessions cannot ingest.
- **Expired sessions.** When the server rejects a session, the app signs the user out and returns them to the sign-in page.

## Remaining limitations

- **Email** is delivered only when `EMAIL_BACKEND=smtp` is set. Otherwise nothing is sent, and the app never says it was.
- **Slack and PagerDuty** deliver only when `SLACK_WEBHOOK_URL` or `PAGERDUTY_ROUTING_KEY` is set. Every attempt is recorded in `GET /api/v1/notifications`.
- **Not built yet:** log integration (incident logs show sample lines only in the browser-only demo), cloud connectors (CloudWatch, Azure, Prometheus remote-write, Redfish), Google sign-in and billing.
- **Unvalidated metrics.** Rack inlet temperature is not measured. Memory, temperature, power and latency anomalies have not been validated against labeled data.
- **Version pins.** The model artifact is plain JSON, so it does not depend on scikit-learn's version. Training was run with scikit-learn 1.9.0 and numpy 2.4 locally (recorded in `evaluation.json`). Retraining with the pinned `requirements-ml.txt` (scikit-learn 1.6.1, Python 3.11) gives the same alert-rule results. Some other figures move by about 0.01, because random number streams differ between library versions.
