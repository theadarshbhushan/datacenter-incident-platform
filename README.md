# VaultWatch

VaultWatch is a data center incident monitoring and prediction app. It has:

- a public marketing site,
- account flows (sign up, verify email, reset password, invitations),
- a six-step onboarding,
- an organization workspace: dashboard, incidents, predictions, infrastructure, reports, alerts, team, settings, billing and integrations.

| Folder | What it is |
| --- | --- |
| `dc-frontend/` | React 18 + TypeScript + Vite + Tailwind single-page app |
| `dc-backend/` | FastAPI + MongoDB (Beanie) API: sessions, organizations, roles, workspace, ingestion |
| `dc-ingestion/`, `dc-ml/`, `infra/` | Kafka telemetry producer, ML service, Prometheus/Grafana (unchanged pipeline) |

## Run it

### 1. Demo mode (no backend)

```bash
cd dc-frontend
npm install
npm run dev            # http://localhost:5173
```

`VITE_API_MODE` defaults to `mock`. A banner on every page says demo mode is active. Sign in with any of these accounts. They all use the password `Demo@12345`.

| Email | Role |
| --- | --- |
| `owner@vaultwatch.dev` | Owner |
| `admin@vaultwatch.dev` | Admin |
| `engineer@vaultwatch.dev` | Engineer |
| `viewer@vaultwatch.dev` | Viewer |

Emails that a real deployment would send appear at `/dev/mailbox`.

### 2. Frontend with the real backend

You need MongoDB. Run it locally, or start only the database container with `docker compose up mongodb`.

```bash
cp .env.example .env                 # then replace every "replace-me" value
cd dc-backend
python -m venv .venv && . .venv/bin/activate     # Python 3.11
pip install -r requirements-dev.txt
MONGO_URI=mongodb://localhost:27017 uvicorn app.main:app --reload --port 8000

# second terminal
cd dc-frontend
echo "VITE_API_MODE=api" > .env.local
npm run dev                          # Vite proxies /api to :8000, so cookies stay first-party
```

In development, verification, reset and invitation links are not emailed. They are listed at `http://localhost:5173/api/v1/dev/mail`. Set `EMAIL_BACKEND=smtp` and the `SMTP_*` variables to send real email.

### 3. Everything with Docker

```bash
cp .env.example .env    # fill in SECRET_KEY, MONGO_*, GRAFANA_ADMIN_PASSWORD
docker compose up --build
```

### Checks

```bash
cd dc-frontend && npm run typecheck && npm run build
cd dc-backend  && pytest            # 22 API tests against an in-memory MongoDB
```

## What is real and what is demo

| Area | Demo mode (`VITE_API_MODE=mock`) | With `dc-backend` (`VITE_API_MODE=api`) |
| --- | --- | --- |
| Accounts and sign-in | Browser-only accounts. Passwords are PBKDF2-hashed in localStorage. **Not real authentication.** | Server sessions in an HttpOnly, Secure, SameSite cookie. bcrypt password hashes. CSRF tokens. Rate limits. |
| Email (verify, reset, invites) | Never sent. Shown in `/dev/mailbox`. | `console` backend logs messages and lists them at `/api/v1/dev/mail` (development only). `smtp` sends them. |
| Roles and permissions | Checked by the mock API | Enforced by the server on every request (`app/core/permissions.py`) |
| Organizations and team | Simulated | Real, isolated per organization |
| Infrastructure and metrics | Labeled sample data | Sample environment (labeled), or real servers reporting via `POST /api/v1/metrics` with an org API key |
| Predictions and AI analysis | Sample data, labeled "sample" | Still sample data. No model is connected to the workspace yet (see `dc-ml/`). |
| Billing | Plan changes are recorded. Nothing is charged. | Same. No payment provider is integrated. `BILLING_PROVIDER` is reserved for that. |
| Google sign-in | Hidden | Hidden until `VITE_GOOGLE_AUTH_ENABLED=true` and OAuth is implemented on the backend |
| Contact form | Not delivered (the page says so) | Stored in MongoDB, and emailed to `CONTACT_INBOX` when SMTP is configured |
| Privacy and Terms pages | Draft placeholders, not legal advice | Same. Replace them with reviewed text before launch. |

## Security model (summary)

- **Sessions.** The session token lives only in the `vw_session` cookie (HttpOnly, Secure, SameSite=Lax). MongoDB stores its SHA-256 hash. Nothing secret is kept in localStorage.
- **CSRF.** Every cookie-authenticated write needs a signed double-submit token: the `vw_csrf` cookie plus the `X-CSRF-Token` header. Writes from origins not listed in `CORS_ORIGINS` are refused.
- **Single-use tokens.** Reset tokens (30 minutes), verification tokens (24 hours) and invitation tokens (7 days) work once, expire, and are stored hashed. A password reset or password change ends the user's other sessions.
- **Rate limits.**
  - login: 5 failures per email per 15 minutes, plus a per-IP cap;
  - password reset: 3 per email per 15 minutes;
  - signup, contact, verification resend, token checks and invitations are also limited.
- **No account discovery.**
  - Login errors are generic.
  - "Forgot password" always gives the same answer.
  - Signup always replies "check your email". If the email is already registered, its owner receives a sign-in reminder instead.
- **Tenant isolation.**
  - Every workspace query is filtered by the organization of the caller's verified membership.
  - API keys are scoped to one organization and stored hashed.
  - The old telemetry routes (`/servers`, `/incidents`, `/analytics`, ...) hold pipeline-wide data. They are now service-only (`X-Internal-Token`).
- **Removed.** The old "demo token" bypass and the login route that auto-created an admin account are gone.
- **Errors.** Unexpected errors return a generic message. Details go to the server logs only.

The in-memory rate limiter is per process. Use one API worker, or move the limiter to Redis before scaling out.

## Database (MongoDB) schema and recommendations

| Collection | Key fields | Indexes |
| --- | --- | --- |
| `users` | `email` (lower-case), `hashed_password` (bcrypt), `full_name`, `email_verified`, `onboarding_completed`, `preferences` | unique `email` |
| `organizations` | `_id` (`org_…`), `name`, `plan`, `monitoring_mode`, `trial_ends_at` | |
| `memberships` | `org_id`, `user_id`, `role` | unique (`org_id`, `user_id`), `user_id` |
| `invitations` | `org_id`, `email`, `role`, `status`, `token_hash`, `expires_at` | `org_id`, `token_hash` |
| `auth_tokens` | `kind` (reset/verify), `token_hash`, `user_id`, `expires_at`, `used_at` | unique `token_hash`, (`user_id`, `kind`), TTL on `expires_at` (+7 days) |
| `user_sessions` | `_id` (public id), `token_hash`, `user_id`, `org_id`, `expires_at`, `remember` | unique `token_hash`, `user_id`, TTL on `expires_at` |
| `api_keys` | `org_id`, `name`, `prefix`, `key_hash`, `scopes` | unique `key_hash`, `org_id` |
| `org_workspaces` | `_id` = org id, `data_centers`, `racks`, `servers`, `predictions`, `alert_rules`, settings | |
| `workspace_incidents`, `workspace_alerts` | `org_id`, id, `created_at`, `data` | unique (`org_id`, id), (`org_id`, `created_at`) |
| `audit_log` | `org_id`, `at`, `actor`, `action` | (`org_id`, `at`) |
| `servers`, `metrics` | telemetry. `servers.org_id` is set for API-key ingestion. `metrics` is a time-series collection. | |
| `onboarding_drafts`, `contact_messages`, `dev_mail` | | unique `user_id` on drafts |

Recommendations before production:

1. TTL indexes already clean up expired rows:
   - sessions at expiry;
   - reset and verification tokens a week after expiry;
   - development mail after a day.
2. Turn on MongoDB authentication and TLS, and give the API a least-privilege user.
3. Back up the database and test restores. Set a retention policy on `metrics`, and match it to the "Data retention" setting.
4. As incident volume grows, move incident timelines into their own collection.
5. Put a Redis-backed rate limiter in front of the authentication routes.
