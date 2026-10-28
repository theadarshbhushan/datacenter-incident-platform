/*
 * Client for the FastAPI backend (dc-backend). Used when VITE_API_MODE=api.
 *
 * Authentication is a server-side session in an HttpOnly, Secure, SameSite cookie set by the
 * backend. This client never sees or stores the session secret. Unsafe requests carry a CSRF token
 * (double-submit pattern) obtained from GET /auth/csrf and kept in memory only.
 */
import type {
  Alert, AlertRule, Incident, Invitation, InvitationDetails, MailMessage, Member, MonitoringSettings,
  NotificationSettings, Organization, Session, User, UserSession, Workspace,
} from '@/types/domain';
import type { IncidentContext, MetricSeries, ReportSummary } from '@/types/domain';
import {
  ApiError, SESSION_EXPIRED_EVENT, type ApiClient, type BackendHealth, type CreatedApiKey, type IntegrationStatus, type PredictionRunResult,
  type SignupResult, type TokenState, type VerifyResult,
} from './types';
import { config } from '@/config/env';

const base = `${config.apiUrl}/api/v1`;
let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${base}/auth/csrf`, { credentials: 'include' });
  const body = await res.json().catch(() => null);
  csrfToken = body?.data?.csrfToken ?? null;
  if (!csrfToken) throw new ApiError(res.status || 500, 'Could not start a secure session with the server.');
  return csrfToken;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 403 && payload?.code === 'csrf_failed' && retry) {
      csrfToken = null;
      return request<T>(method, path, body, false);
    }
    // A 401 outside the sign-in flows means the session expired or was revoked: tell the app to sign out.
    if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/invitations/') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    const message = typeof payload?.message === 'string' ? payload.message : res.status >= 500 ? 'The server had a problem. Please try again.' : 'Request failed.';
    throw new ApiError(res.status, message, payload?.code ?? 'error', payload?.fields ?? undefined);
  }
  return (payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload) as T;
}

const get = <T,>(p: string) => request<T>('GET', p);
const post = <T,>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const put = <T,>(p: string, b: unknown) => request<T>('PUT', p, b);
const patch = <T,>(p: string, b: unknown) => request<T>('PATCH', p, b);
const del = <T,>(p: string) => request<T>('DELETE', p);

export const httpApi: ApiClient = {
  mode: 'api',

  async getSession() {
    try {
      return await get<Session>('/auth/session');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  async login(input) {
    const s = await post<Session>('/auth/login', input);
    csrfToken = null; // the server rotates the CSRF token with the session
    return s;
  },
  async signup(input) {
    const r = await post<SignupResult>('/auth/signup', input);
    csrfToken = null;
    return r;
  },
  async logout() {
    await post('/auth/logout');
    csrfToken = null;
  },
  requestPasswordReset: (email) => post('/auth/password/forgot', { email }),
  checkResetToken: async (token) => (await post<{ state: TokenState }>('/auth/password/reset/check', { token })).state,
  resetPassword: (token, password) => post('/auth/password/reset', { token, password }),
  verifyEmail: async (token) => (await post<{ result: VerifyResult }>('/auth/email/verify', { token })).result,
  resendVerification: (email) => post('/auth/email/resend', { email: email ?? null }),
  async getInvitation(token) {
    const r = await post<{ state: TokenState; details?: InvitationDetails }>('/invitations/lookup', { token });
    return r.state === 'valid' && r.details ? r.details : r.state;
  },
  acceptInvitation: (token, account) => post<Session>('/invitations/accept', { token, account: account ?? null }),
  declineInvitation: (token) => post('/invitations/decline', { token }),

  updateProfile: (p) => patch<User>('/me', p),
  changePassword: (current, next) => post('/me/password', { current, next }),
  listSessions: () => get<UserSession[]>('/me/sessions'),
  revokeSession: (id) => del(`/me/sessions/${encodeURIComponent(id)}`),

  switchOrganization: (orgId) => post<Session>('/orgs/switch', { orgId }),
  saveOnboardingDraft: (step, draft) => put('/onboarding/draft', { step, draft }),
  getOnboardingDraft: () => get<{ step: number; draft: unknown } | null>('/onboarding/draft'),
  completeOnboarding: (input) => post<Session>('/onboarding/complete', input),
  skipOnboarding: () => post<Session>('/onboarding/skip'),
  updateOrganization: (p) => patch<Organization>('/org', p),
  changePlan: (plan) => post<Organization>('/org/plan', { plan }),

  getWorkspace: () => get<Workspace>('/workspace'),
  createIncident: (input) => post<Incident>('/workspace/incidents', input),
  updateIncident: (id, action) => post<Incident>(`/workspace/incidents/${encodeURIComponent(id)}/actions`, action),
  updateAlert: (id, action) => post<Alert>(`/workspace/alerts/${encodeURIComponent(id)}/actions`, { type: action }),
  saveAlertRule: (rule) => put<AlertRule>(`/workspace/alert-rules/${encodeURIComponent(rule.id || 'new')}`, rule),
  deleteAlertRule: (id) => del(`/workspace/alert-rules/${encodeURIComponent(id)}`),
  updateNotificationSettings: (s) => put<NotificationSettings>('/workspace/notification-settings', s),
  updateMonitoring: (s) => put<MonitoringSettings>('/workspace/monitoring', s),
  loadSampleEnvironment: () => post('/workspace/sample-environment'),
  removeSampleEnvironment: () => del('/workspace/sample-environment'),
  getIntegrationStatus: () => get<IntegrationStatus>('/integrations/status'),

  getMetrics: (serverId, window, metrics) =>
    get<MetricSeries>(`${serverId ? `/servers/${encodeURIComponent(serverId)}/metrics` : '/metrics/fleet'}?window=${window}&metrics=${metrics.join(',')}`),
  getIncidentContext: (id, window) => get<IncidentContext>(`/incidents/${encodeURIComponent(id)}?window=${window}`),
  runPredictions: () => post<PredictionRunResult>('/predictions/run', {}),
  getReportSummary: (from, to) =>
    get<ReportSummary>(`/reports/summary?start=${encodeURIComponent(new Date(from).toISOString())}&end=${encodeURIComponent(new Date(to).toISOString())}`),

  inviteMember: (email, role) => post<Invitation>('/team/invitations', { email, role }),
  changeMemberRole: (userId, role) => patch<Member>(`/team/members/${encodeURIComponent(userId)}`, { role }),
  removeMember: (userId) => del(`/team/members/${encodeURIComponent(userId)}`),
  revokeInvitation: (id) => del(`/team/invitations/${encodeURIComponent(id)}`),
  resendInvitation: (id) => post(`/team/invitations/${encodeURIComponent(id)}/resend`),

  createApiKey: (name, scopes) => post<CreatedApiKey>('/api-keys', { name, scopes }),
  revokeApiKey: (id) => del(`/api-keys/${encodeURIComponent(id)}`),
  async checkBackendHealth(): Promise<BackendHealth> {
    const started = performance.now();
    try {
      const res = await fetch(`${config.apiUrl}/health`, { credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { reachable: false, error: `Health check returned HTTP ${res.status}.` };
      return { reachable: true, status: body?.data?.status ?? 'ok', version: body?.data?.version, latencyMs: Math.round(performance.now() - started) };
    } catch {
      return { reachable: false, error: 'The backend is not reachable. Check VITE_API_URL and that dc-backend is running.' };
    }
  },

  submitContact: (input) => post<{ delivered: boolean }>('/contact', input),
  async listMail() {
    // Only served by the backend in development with the console email backend.
    try { return await get<MailMessage[]>('/dev/mail'); } catch { return []; }
  },
};
