# VaultWatch web app

React 18, TypeScript, Vite, Tailwind CSS, React Router, React Hook Form + Zod, Recharts, Lucide icons.

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run build        # type-checks, then builds to dist/
```

## Modes

The modes are set with `VITE_API_MODE` (see `.env.sample`).

- **`mock`** (default): an in-browser backend (`src/services/mockApi.ts`) with sample data and four demo accounts. All of them use the password `Demo@12345`: owner@, admin@, engineer@ and viewer@vaultwatch.dev. It is a demo, not authentication. Nothing is emailed or charged; messages show up at `/dev/mailbox`.
- **`api`**: uses `dc-backend` through `src/services/httpApi.ts`. Sessions are HttpOnly cookies, and writes send a CSRF token. During `npm run dev`, Vite proxies `/api` to `VITE_PROXY_TARGET` (default `http://localhost:8000`).

Both modes implement the same `ApiClient` interface (`src/services/types.ts`). Pages never know which one is active.

## Structure

| Path | Contents |
| --- | --- |
| `src/routes/` | Route table and guards: auth, verified email, onboarding, permissions |
| `src/context/` | Auth session, organization workspace, toasts |
| `src/pages/marketing`, `auth`, `onboarding`, `app` | Screens |
| `src/components/ui`, `layout`, `charts`, `app`, `forms` | Shared components |
| `src/utils/permissions.ts` | Role matrix. Keep it in sync with `dc-backend/app/core/permissions.py`. |
| `legacy/` | The previous JSX pages, kept for reference. They are not built or imported. Delete when no longer needed. |
