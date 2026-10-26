# VaultWatch API (FastAPI)

## Run

```bash
python -m venv .venv && . .venv/bin/activate      # Python 3.11
pip install -r requirements-dev.txt
export MONGO_URI=mongodb://localhost:27017 ENVIRONMENT=development
uvicorn app.main:app --reload --port 8000          # docs at http://localhost:8000/docs (development only)
pytest                                             # in-memory MongoDB, no services needed
```

Configuration comes from `../.env` (see `../.env.example`). Outside `ENVIRONMENT=development`, the app refuses to start without a strong `SECRET_KEY`.

## Layout

| Path | Purpose |
| --- | --- |
| `app/core/auth.py` | Cookie sessions, CSRF, `require_user` / `require_org(permission)` dependencies, password hashing |
| `app/core/permissions.py` | Role matrix. The frontend mirrors it in `src/utils/permissions.ts`. |
| `app/core/ratelimit.py` | Sliding-window rate limiter (in-memory) |
| `app/core/mailer.py` | Console or SMTP email |
| `app/models/account.py` | Organizations, memberships, invitations, tokens, sessions, API keys, workspace documents |
| `app/routers/auth.py` | `/auth/*`, `/invitations/*`, `/me/*`, `/orgs/switch`, `/onboarding/*`, `/org` |
| `app/routers/workspace.py` | `/workspace/*`, `/team/*`, `/api-keys`, `/contact`, `/dev/mail` |
| `app/routers/ingest.py` | `POST /metrics` for agents, authenticated with an org API key |
| `app/services/sample_data.py` | The labeled sample environment. It matches the frontend demo data exactly. |
| `routers/servers.py` … `analytics.py` | Internal telemetry API. Needs `X-Internal-Token`; disabled when `INTERNAL_API_TOKEN` is empty. |

Responses use the shape `{success, data, message, code, fields, timestamp}`. Errors carry a stable `code`, for example `invalid_credentials`, `rate_limited`, `csrf_failed`, `forbidden`, `no_org`, `token_expired`, or `validation_error` with per-field messages.

## Sending metrics

1. Create a key in **Integrations → API keys**. It needs the `metrics:write` scope.
2. Send readings:

```bash
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "X-API-Key: $VAULTWATCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"server_id":"srv-01","hostname":"web-01","cpu_pct":42.1,"ram_pct":61.0,"temp_celsius":48.5}'
```

Servers that report this way appear in the organization's Infrastructure view, unless the sample environment is loaded.
