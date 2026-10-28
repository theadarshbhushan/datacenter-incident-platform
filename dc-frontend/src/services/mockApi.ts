/*
 * In-browser mock backend used when VITE_API_MODE=mock (the default for local development).
 *
 * It exists so the whole product can be explored without running the FastAPI stack. It is NOT
 * production authentication: the "database" lives in this browser's localStorage, no email is
 * sent (messages land in the developer mailbox instead), no payment is taken and predictions are
 * sample data. Passwords are stored only as salted PBKDF2 hashes and tokens only as SHA-256 hashes,
 * so even the mock never keeps a plaintext secret at rest.
 */
import type {
  Alert, AlertRule, ApiKey, AuditEntry, Incident, Invitation, InvitationDetails, MailMessage, Member, Membership,
  MonitoringSettings, NotificationSettings, Organization, PlanId, Role, Session, TimelineEvent, User, UserPreferences,
  UserSession, Workspace,
} from '@/types/domain';
import {
  ApiError, type ApiClient, type BackendHealth, type ContactInput, type CreatedApiKey, type IncidentAction, type IntegrationStatus,
  type LoginInput, type OnboardingInput, type SignupInput, type SignupResult, type TokenState, type VerifyResult,
} from './types';
import {
  analysisFor, buildAlerts, buildIncidents, buildInfrastructure, buildPredictions, defaultAlertRules, defaultMonitoring,
  defaultNotificationSettings, demoDataCenters, demoModel, sampleLogs, sampleMetricSeries,
} from '@/data/demo';
import { mockReportSummary } from '@/utils/analytics';
import { randomId, randomToken, sha256 } from '@/utils/random';
import { can, assignableRoles, canManageMember, type Permission } from '@/utils/permissions';
import { config } from '@/config/env';

const DB_KEY = 'vw-mock-db';
const SESSION_KEY = 'vw-mock-session';
const DB_VERSION = 4; // 4: prediction schema with anomaly scores, telemetry health
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEMO_PASSWORD = 'Demo@12345';
export const DEMO_ACCOUNTS = [
  { email: 'owner@vaultwatch.dev', role: 'owner' as Role, name: 'Adarsh Bhushan' },
  { email: 'admin@vaultwatch.dev', role: 'admin' as Role, name: 'Rohan Mehta' },
  { email: 'engineer@vaultwatch.dev', role: 'engineer' as Role, name: 'Priya Nair' },
  { email: 'viewer@vaultwatch.dev', role: 'viewer' as Role, name: 'Karan Shah' },
];
/** Known tokens so expired and invalid link states can be tried from the mailbox. */
export const DEMO_EXPIRED_RESET_TOKEN = 'demo-expired-reset-token';
export const DEMO_EXPIRED_VERIFY_TOKEN = 'demo-expired-verify-token';

interface MockUser extends User { passwordHash: string; salt: string; referral?: string }
interface MockToken {
  hash: string;
  kind: 'reset' | 'verify' | 'invite';
  email: string;
  userId: string | null;
  inviteId: string | null;
  expiresAt: number;
  usedAt: number | null;
}
interface MockSession { id: string; userId: string; orgId: string | null; device: string; createdAt: string; lastActive: string }
interface DB {
  version: number;
  seededAt: number;
  users: MockUser[];
  orgs: Organization[];
  memberships: Membership[];
  invitations: Invitation[];
  tokens: MockToken[];
  sessions: MockSession[];
  workspaces: Record<string, Omit<Workspace, 'members' | 'invitations'>>;
  drafts: Record<string, { step: number; draft: unknown }>;
  mail: MailMessage[];
  hits: Record<string, number[]>;
  apiKeyHashes: Record<string, string>;
}

const avatarColors = ['#16834A', '#2563EB', '#7C3AED', '#D97706', '#DB2777', '#0891B2'];

// ---------- persistence ----------

let dbPromise: Promise<DB> | null = null;

function readStore(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}
function writeStore(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch { /* storage unavailable: state lives for this tab only */ }
}

async function loadDb(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = readStore(localStorage, DB_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DB;
          if (parsed.version === DB_VERSION) return refreshTimes(parsed);
        } catch { /* fall through and reseed */ }
      }
      const fresh = await seed();
      save(fresh);
      return fresh;
    })();
  }
  return dbPromise;
}

function save(db: DB) {
  writeStore(localStorage, DB_KEY, JSON.stringify(db));
}

/** Shift every stored timestamp forward so sample data stays "recent" across days of use. */
function refreshTimes(db: DB): DB {
  const delta = Date.now() - db.seededAt;
  if (delta < 6 * HOUR) return db;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const shift = (v: unknown): unknown => {
    if (typeof v === 'string' && iso.test(v)) return new Date(new Date(v).getTime() + delta).toISOString();
    if (Array.isArray(v)) return v.map(shift);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x)]));
    return v;
  };
  const workspaces = shift(db.workspaces) as DB['workspaces'];
  const next = { ...db, workspaces, seededAt: Date.now() };
  save(next);
  return next;
}

export async function resetMockDatabase() {
  writeStore(localStorage, DB_KEY, null);
  writeStore(localStorage, SESSION_KEY, null);
  writeStore(sessionStorage, SESSION_KEY, null);
  dbPromise = null;
  await loadDb();
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 60_000, hash: 'SHA-256' }, key, 256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

const defaultPrefs: UserPreferences = { timezone: 'Asia/Kolkata', dateFormat: 'relative', emailDigest: 'weekly', compactTables: false };

async function makeUser(name: string, email: string, password: string, verified: boolean, onboarded: boolean, idx = 0): Promise<MockUser> {
  const salt = randomToken();
  return {
    id: randomId('usr_'),
    name,
    email: email.toLowerCase(),
    emailVerified: verified,
    avatarColor: avatarColors[idx % avatarColors.length]!,
    createdAt: new Date(Date.now() - (60 - idx) * DAY).toISOString(),
    onboardingCompleted: onboarded,
    preferences: { ...defaultPrefs },
    passwordHash: await hashPassword(password, salt),
    salt,
  };
}

export function sampleWorkspace(owner = 'System', dcName?: string, envName?: string): Omit<Workspace, 'members' | 'invitations'> {
  const now = Date.now();
  const { racks, servers } = buildInfrastructure();
  const dataCenters = demoDataCenters.map((d, i) => (i === 0 && dcName ? { ...d, name: dcName, environment: envName || d.environment } : { ...d }));
  return {
    dataCenters,
    racks,
    servers,
    incidents: buildIncidents(servers, now, owner),
    predictions: buildPredictions(servers, now),
    model: demoModel(),
    alerts: buildAlerts(now),
    alertRules: defaultAlertRules.map((r) => ({ ...r })),
    notificationSettings: { ...defaultNotificationSettings },
    monitoring: { ...defaultMonitoring },
    apiKeys: [],
    audit: [],
    telemetry: { status: 'demo', lastReceivedAt: null, serversReporting: 0, serversTotal: 0, demoServers: servers.length, acceptedLastHour: 0, rejectedLastHour: 0, accepted24h: 0, rejected24h: 0, lastError: null },
    sample: true,
  };
}

function emptyWorkspace(dcName?: string, envName?: string): Omit<Workspace, 'members' | 'invitations'> {
  return {
    dataCenters: dcName ? [{ id: randomId('dc_'), name: dcName, location: '—', environment: envName || 'Production' }] : [],
    racks: [],
    servers: [],
    incidents: [],
    predictions: [],
    model: null,
    alerts: [],
    alertRules: defaultAlertRules.map((r) => ({ ...r })),
    notificationSettings: { ...defaultNotificationSettings },
    monitoring: { ...defaultMonitoring },
    apiKeys: [],
    audit: [],
    telemetry: { status: 'waiting', lastReceivedAt: null, serversReporting: 0, serversTotal: 0, demoServers: 0, acceptedLastHour: 0, rejectedLastHour: 0, accepted24h: 0, rejected24h: 0, lastError: null },
    sample: false,
  };
}

async function seed(): Promise<DB> {
  const now = Date.now();
  const users: MockUser[] = [];
  for (const [i, a] of DEMO_ACCOUNTS.entries()) users.push(await makeUser(a.name, a.email, DEMO_PASSWORD, true, true, i));
  const orgA: Organization = {
    id: 'org_acme', name: 'Acme Data Centers', size: '201-1000', industry: 'Colocation provider', plan: 'team',
    environmentType: 'hybrid', monitoringMode: 'demo', createdAt: new Date(now - 60 * DAY).toISOString(),
    trialEndsAt: new Date(now + 9 * DAY).toISOString(),
  };
  const orgB: Organization = {
    id: 'org_northwind', name: 'Northwind Cloud', size: '51-200', industry: 'Cloud / SaaS', plan: 'trial',
    environmentType: 'cloud', monitoringMode: 'demo', createdAt: new Date(now - 20 * DAY).toISOString(),
    trialEndsAt: new Date(now + 4 * DAY).toISOString(),
  };
  const memberships: Membership[] = users.map((u, i) => ({ orgId: orgA.id, userId: u.id, role: DEMO_ACCOUNTS[i]!.role, joinedAt: u.createdAt }));
  memberships.push({ orgId: orgB.id, userId: users[0]!.id, role: 'viewer', joinedAt: orgB.createdAt });

  const wsA = sampleWorkspace(users[0]!.name);
  // Spread assignments across the team so the incident table has owners.
  wsA.incidents.forEach((inc, i) => { inc.assigneeId = users[i % users.length]!.id; });
  const wsB = sampleWorkspace('System', 'NW-1', 'Production');

  const db: DB = {
    version: DB_VERSION, seededAt: now, users, orgs: [orgA, orgB], memberships, invitations: [], tokens: [],
    sessions: [], workspaces: { [orgA.id]: wsA, [orgB.id]: wsB }, drafts: {}, mail: [], hits: {}, apiKeyHashes: {},
  };

  // A pending invitation whose link is waiting in the developer mailbox.
  const inviteToken = randomToken();
  const invite: Invitation = {
    id: randomId('inv_'), orgId: orgA.id, email: 'new.hire@example.com', role: 'engineer', status: 'pending',
    invitedBy: users[0]!.name, createdAt: new Date(now - 2 * HOUR).toISOString(), expiresAt: new Date(now + 7 * DAY).toISOString(),
  };
  db.invitations.push(invite);
  db.tokens.push({ hash: await sha256(inviteToken), kind: 'invite', email: invite.email, userId: null, inviteId: invite.id, expiresAt: now + 7 * DAY, usedAt: null });
  pushMail(db, invite.email, `${users[0]!.name} invited you to ${orgA.name} on VaultWatch`, 'Accept the invitation to join as Engineer.', `/accept-invitation?token=${inviteToken}`);

  // Expired tokens for testing the expired-link states.
  db.tokens.push({ hash: await sha256(DEMO_EXPIRED_RESET_TOKEN), kind: 'reset', email: users[0]!.email, userId: users[0]!.id, inviteId: null, expiresAt: now - HOUR, usedAt: null });
  db.tokens.push({ hash: await sha256(DEMO_EXPIRED_VERIFY_TOKEN), kind: 'verify', email: users[0]!.email, userId: users[0]!.id, inviteId: null, expiresAt: now - HOUR, usedAt: null });
  return db;
}

function pushMail(db: DB, to: string, subject: string, body: string, link: string) {
  db.mail.unshift({ id: randomId('mail_'), to, subject, body, link, createdAt: new Date().toISOString() });
  db.mail = db.mail.slice(0, 50);
}

// ---------- helpers ----------

const delay = (ms = 220 + Math.random() * 280) => new Promise((r) => setTimeout(r, ms));

function currentSessionId(): string | null {
  return readStore(sessionStorage, SESSION_KEY) || readStore(localStorage, SESSION_KEY);
}

function setSessionPointer(id: string | null, remember = false) {
  writeStore(localStorage, SESSION_KEY, null);
  writeStore(sessionStorage, SESSION_KEY, null);
  if (id) writeStore(remember ? localStorage : sessionStorage, SESSION_KEY, id);
}

function publicUser(u: MockUser): User {
  const { passwordHash: _p, salt: _s, referral: _r, ...rest } = u;
  return { ...rest, preferences: { ...rest.preferences } };
}

function buildSession(db: DB, s: MockSession): Session {
  const user = db.users.find((u) => u.id === s.userId)!;
  const mships = db.memberships.filter((m) => m.userId === user.id);
  const orgs = mships.map((m) => ({ id: m.orgId, name: db.orgs.find((o) => o.id === m.orgId)!.name, role: m.role }));
  let orgId = s.orgId;
  if (!orgId || !mships.some((m) => m.orgId === orgId)) orgId = mships[0]?.orgId ?? null;
  s.orgId = orgId;
  const org = orgId ? db.orgs.find((o) => o.id === orgId) ?? null : null;
  return {
    user: publicUser(user),
    organization: org ? { ...org } : null,
    role: mships.find((m) => m.orgId === orgId)?.role ?? null,
    organizations: orgs,
    mode: 'mock',
  };
}

async function requireSession(): Promise<{ db: DB; s: MockSession; user: MockUser }> {
  const db = await loadDb();
  const id = currentSessionId();
  const s = id ? db.sessions.find((x) => x.id === id) : undefined;
  if (!s) throw new ApiError(401, 'Your session has expired. Please sign in again.', 'unauthenticated');
  const user = db.users.find((u) => u.id === s.userId);
  if (!user) throw new ApiError(401, 'Your session has expired. Please sign in again.', 'unauthenticated');
  s.lastActive = new Date().toISOString();
  return { db, s, user };
}

async function requireOrg(permission?: Permission) {
  const ctx = await requireSession();
  const session = buildSession(ctx.db, ctx.s);
  if (!session.organization || !session.role) throw new ApiError(403, 'You are not a member of an organization yet.', 'no_org');
  if (permission && !can(session.role, permission)) throw new ApiError(403, 'Your role does not allow this action.', 'forbidden');
  const ws = ctx.db.workspaces[session.organization.id];
  if (!ws) throw new ApiError(404, 'Workspace not found.', 'not_found');
  return { ...ctx, session, org: ctx.db.orgs.find((o) => o.id === session.organization!.id)!, role: session.role, ws };
}

function rateLimit(db: DB, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (db.hits[key] ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const retry = Math.ceil((windowMs - (now - hits[0]!)) / 60000);
    throw new ApiError(429, `Too many attempts. Try again in ${retry} minute${retry === 1 ? '' : 's'}.`, 'rate_limited');
  }
  hits.push(now);
  db.hits[key] = hits;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} on ${os}`;
}

function startSession(db: DB, user: MockUser, remember: boolean, orgId?: string | null): Session {
  const s: MockSession = {
    id: randomToken(), userId: user.id, orgId: orgId ?? null, device: deviceLabel(),
    createdAt: new Date().toISOString(), lastActive: new Date().toISOString(),
  };
  db.sessions.push(s);
  setSessionPointer(s.id, remember);
  const session = buildSession(db, s);
  save(db);
  return session;
}

async function issueToken(db: DB, kind: MockToken['kind'], email: string, userId: string | null, ttlMs: number, inviteId: string | null = null) {
  const token = randomToken();
  // Invalidate older unused tokens of the same kind for this user so only the latest link works.
  db.tokens.forEach((t) => { if (t.kind === kind && t.email === email && !t.usedAt && kind !== 'invite') t.usedAt = Date.now(); });
  db.tokens.push({ hash: await sha256(token), kind, email, userId, inviteId, expiresAt: Date.now() + ttlMs, usedAt: null });
  return token;
}

async function findToken(db: DB, token: string, kind: MockToken['kind']): Promise<{ state: TokenState; record?: MockToken }> {
  if (!token || token.length < 8) return { state: 'invalid' };
  const hash = await sha256(token);
  const record = db.tokens.find((t) => t.hash === hash && t.kind === kind);
  if (!record) return { state: 'invalid' };
  if (record.usedAt) return { state: 'used', record };
  if (record.expiresAt < Date.now()) return { state: 'expired', record };
  return { state: 'valid', record };
}

function audit(ws: { audit: AuditEntry[] }, actor: string, action: string) {
  ws.audit.unshift({ id: randomId('aud_'), at: new Date().toISOString(), actor, action });
  ws.audit = ws.audit.slice(0, 200);
}

function members(db: DB, orgId: string): Member[] {
  return db.memberships.filter((m) => m.orgId === orgId).map((m) => {
    const u = db.users.find((x) => x.id === m.userId)!;
    const last = db.sessions.filter((s) => s.userId === u.id).map((s) => s.lastActive).sort().pop();
    return { userId: u.id, name: u.name, email: u.email, role: m.role, joinedAt: m.joinedAt, avatarColor: u.avatarColor, lastActive: last };
  });
}

function nextIncidentId(incidents: Incident[]): string {
  const year = new Date().getFullYear();
  const max = incidents.reduce((acc, i) => Math.max(acc, Number(i.id.split('-').pop()) || 0), 0);
  return `INC-${year}-${String(max + 1).padStart(4, '0')}`;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---------- client ----------

export const mockApi: ApiClient = {
  mode: 'mock',

  async getSession() {
    await delay(80);
    const db = await loadDb();
    const id = currentSessionId();
    const s = id ? db.sessions.find((x) => x.id === id) : undefined;
    if (!s || !db.users.some((u) => u.id === s.userId)) {
      if (id) setSessionPointer(null);
      return null;
    }
    const session = buildSession(db, s);
    save(db);
    return session;
  },

  async login({ email, password, remember }: LoginInput) {
    await delay();
    const db = await loadDb();
    const key = `login:${email.toLowerCase()}`;
    const recent = (db.hits[key] ?? []).filter((t) => Date.now() - t < 15 * MIN);
    if (recent.length >= 5) throw new ApiError(429, 'Too many failed sign-in attempts. Try again in 15 minutes or reset your password.', 'rate_limited');
    const user = db.users.find((u) => u.email === email.toLowerCase());
    const ok = user ? (await hashPassword(password, user.salt)) === user.passwordHash : false;
    if (!user || !ok) {
      db.hits[key] = [...recent, Date.now()];
      save(db);
      throw new ApiError(401, 'Incorrect email or password.', 'invalid_credentials');
    }
    delete db.hits[key];
    return startSession(db, user, remember);
  },

  async signup({ name, email, company, password, ref }: SignupInput): Promise<SignupResult> {
    await delay();
    const db = await loadDb();
    rateLimit(db, 'signup', 10, HOUR);
    const normalized = email.toLowerCase();
    const existing = db.users.find((u) => u.email === normalized);
    if (existing) {
      // Same response as a new signup; only the mailbox owner learns the account exists.
      if (!existing.emailVerified) {
        const token = await issueToken(db, 'verify', normalized, existing.id, DAY);
        pushMail(db, normalized, 'Verify your VaultWatch email address', 'Confirm your email to finish creating your account. The link expires in 24 hours.', `/verify-email?token=${token}`);
      } else {
        pushMail(db, normalized, 'You already have a VaultWatch account', 'Someone tried to create a new account with this email address. If it was you, sign in instead, or reset your password if you have forgotten it.', '/login');
      }
      save(db);
      return { session: null, verificationRequired: true };
    }
    const user = await makeUser(name, normalized, password, false, false, db.users.length);
    if (ref) user.referral = ref.slice(0, 64);
    db.users.push(user);
    const org: Organization = {
      id: randomId('org_'), name: company, size: '', industry: '', plan: 'trial', environmentType: 'hybrid', monitoringMode: 'later',
      createdAt: new Date().toISOString(), trialEndsAt: new Date(Date.now() + 14 * DAY).toISOString(),
    };
    db.orgs.push(org);
    db.memberships.push({ orgId: org.id, userId: user.id, role: 'owner', joinedAt: new Date().toISOString() });
    db.workspaces[org.id] = emptyWorkspace();
    const token = await issueToken(db, 'verify', normalized, user.id, DAY);
    pushMail(db, normalized, 'Verify your VaultWatch email address', 'Confirm your email to finish creating your account. The link expires in 24 hours.', `/verify-email?token=${token}`);
    save(db);
    return { session: null, verificationRequired: true };
  },

  async logout() {
    await delay(120);
    const db = await loadDb();
    const id = currentSessionId();
    db.sessions = db.sessions.filter((s) => s.id !== id);
    setSessionPointer(null);
    save(db);
  },

  async requestPasswordReset(email) {
    await delay();
    const db = await loadDb();
    const normalized = email.toLowerCase();
    rateLimit(db, `reset:${normalized}`, 3, 15 * MIN);
    const user = db.users.find((u) => u.email === normalized);
    // Same response whether or not the account exists.
    if (user) {
      const token = await issueToken(db, 'reset', normalized, user.id, 30 * MIN);
      pushMail(db, normalized, 'Reset your VaultWatch password', 'Use this link to choose a new password. It expires in 30 minutes and can be used once.', `/reset-password?token=${token}`);
    }
    save(db);
  },

  async checkResetToken(token) {
    await delay(150);
    const db = await loadDb();
    return (await findToken(db, token, 'reset')).state;
  },

  async resetPassword(token, password) {
    await delay();
    const db = await loadDb();
    const { state, record } = await findToken(db, token, 'reset');
    if (state !== 'valid' || !record) throw new ApiError(400, state === 'expired' ? 'This reset link has expired.' : 'This reset link is invalid or has already been used.', `token_${state}`);
    const user = db.users.find((u) => u.id === record.userId);
    if (!user) throw new ApiError(400, 'This reset link is invalid.', 'token_invalid');
    user.salt = randomToken();
    user.passwordHash = await hashPassword(password, user.salt);
    record.usedAt = Date.now();
    // Resetting a password signs the account out everywhere.
    db.sessions = db.sessions.filter((s) => s.userId !== user.id);
    setSessionPointer(null);
    save(db);
  },

  async verifyEmail(token): Promise<VerifyResult> {
    await delay();
    const db = await loadDb();
    const { state, record } = await findToken(db, token, 'verify');
    if (state === 'used' && record) {
      const u = db.users.find((x) => x.id === record.userId);
      return u?.emailVerified ? 'already-verified' : 'invalid';
    }
    if (state === 'expired') return 'expired';
    if (state !== 'valid' || !record) return 'invalid';
    const user = db.users.find((u) => u.id === record.userId);
    if (!user) return 'invalid';
    record.usedAt = Date.now();
    const already = user.emailVerified;
    user.emailVerified = true;
    save(db);
    return already ? 'already-verified' : 'verified';
  },

  async resendVerification(email) {
    await delay();
    const db = await loadDb();
    let user: MockUser | undefined;
    const id = currentSessionId();
    const s = id ? db.sessions.find((x) => x.id === id) : undefined;
    if (s) user = db.users.find((u) => u.id === s.userId);
    if (!user && email) user = db.users.find((u) => u.email === email.toLowerCase());
    const target = user?.email ?? email?.toLowerCase() ?? 'unknown';
    rateLimit(db, `verify:${target}`, 3, 15 * MIN);
    if (user && !user.emailVerified) {
      const token = await issueToken(db, 'verify', user.email, user.id, DAY);
      pushMail(db, user.email, 'Verify your VaultWatch email address', 'Confirm your email to finish creating your account. The link expires in 24 hours.', `/verify-email?token=${token}`);
    }
    save(db);
  },

  async getInvitation(token) {
    await delay(200);
    const db = await loadDb();
    const { state, record } = await findToken(db, token, 'invite');
    if (state !== 'valid' || !record) return state;
    const inv = db.invitations.find((i) => i.id === record.inviteId);
    if (!inv || inv.status !== 'pending') return inv?.status === 'expired' ? 'expired' : 'used';
    const details: InvitationDetails = {
      invitation: { ...inv },
      organizationName: db.orgs.find((o) => o.id === inv.orgId)?.name ?? 'Unknown organization',
      inviterName: inv.invitedBy,
      accountExists: db.users.some((u) => u.email === inv.email),
    };
    return details;
  },

  async acceptInvitation(token, account) {
    await delay();
    const db = await loadDb();
    const { state, record } = await findToken(db, token, 'invite');
    if (state !== 'valid' || !record) throw new ApiError(400, 'This invitation is no longer valid.', `token_${state}`);
    const inv = db.invitations.find((i) => i.id === record.inviteId);
    if (!inv || inv.status !== 'pending') throw new ApiError(400, 'This invitation is no longer valid.', 'token_used');

    let user = db.users.find((u) => u.email === inv.email);
    const id = currentSessionId();
    const current = id ? db.sessions.find((s) => s.id === id) : undefined;
    if (user) {
      if (!current || current.userId !== user.id) {
        throw new ApiError(403, `Sign in as ${inv.email} to accept this invitation.`, 'wrong_account');
      }
    } else {
      if (!account) throw new ApiError(400, 'Create an account to accept this invitation.', 'account_required');
      user = await makeUser(account.name, inv.email, account.password, true, true, db.users.length);
      db.users.push(user);
    }
    if (!db.memberships.some((m) => m.orgId === inv.orgId && m.userId === user!.id)) {
      db.memberships.push({ orgId: inv.orgId, userId: user.id, role: inv.role, joinedAt: new Date().toISOString() });
    }
    user.onboardingCompleted = true;
    inv.status = 'accepted';
    record.usedAt = Date.now();
    const ws = db.workspaces[inv.orgId];
    if (ws) audit(ws, user.name, `Joined as ${inv.role}`);
    if (current && current.userId === user.id) {
      current.orgId = inv.orgId;
      const session = buildSession(db, current);
      save(db);
      return session;
    }
    return startSession(db, user, false, inv.orgId);
  },

  async declineInvitation(token) {
    await delay();
    const db = await loadDb();
    const { state, record } = await findToken(db, token, 'invite');
    if (state !== 'valid' || !record) throw new ApiError(400, 'This invitation is no longer valid.', `token_${state}`);
    const inv = db.invitations.find((i) => i.id === record.inviteId);
    if (inv) inv.status = 'declined';
    record.usedAt = Date.now();
    save(db);
  },

  async updateProfile(patch) {
    await delay();
    const { db, user } = await requireSession();
    if (patch.name !== undefined) user.name = patch.name;
    if (patch.jobTitle !== undefined) user.jobTitle = patch.jobTitle;
    if (patch.avatarColor !== undefined) user.avatarColor = patch.avatarColor;
    if (patch.preferences) user.preferences = { ...user.preferences, ...patch.preferences };
    save(db);
    return publicUser(user);
  },

  async changePassword(currentPw, next) {
    await delay();
    const { db, s, user } = await requireSession();
    rateLimit(db, `pwchange:${user.id}`, 5, 15 * MIN);
    if ((await hashPassword(currentPw, user.salt)) !== user.passwordHash) {
      save(db);
      throw new ApiError(400, 'Your current password is incorrect.', 'invalid_password', { current: 'Current password is incorrect.' });
    }
    user.salt = randomToken();
    user.passwordHash = await hashPassword(next, user.salt);
    // Keep this session, sign out all others.
    db.sessions = db.sessions.filter((x) => x.userId !== user.id || x.id === s.id);
    pushMail(db, user.email, 'Your VaultWatch password was changed', 'The password for your account was changed from your profile settings, and other devices were signed out. If you did not do this, reset your password now and contact your administrator.', '/forgot-password');
    save(db);
  },

  async listSessions() {
    await delay(150);
    const { db, s, user } = await requireSession();
    return db.sessions.filter((x) => x.userId === user.id).map<UserSession>((x) => ({
      id: x.id.slice(0, 12), device: x.device, location: 'This browser (mock mode)', createdAt: x.createdAt, lastActive: x.lastActive, current: x.id === s.id,
    }));
  },

  async revokeSession(id) {
    await delay();
    const { db, s, user } = await requireSession();
    const target = db.sessions.find((x) => x.userId === user.id && x.id.startsWith(id));
    if (!target) throw new ApiError(404, 'Session not found.');
    if (target.id === s.id) throw new ApiError(400, 'Use Sign out to end the current session.');
    db.sessions = db.sessions.filter((x) => x !== target);
    save(db);
  },

  async switchOrganization(orgId) {
    await delay();
    const { db, s, user } = await requireSession();
    if (!db.memberships.some((m) => m.userId === user.id && m.orgId === orgId)) throw new ApiError(403, 'You are not a member of that organization.');
    s.orgId = orgId;
    const session = buildSession(db, s);
    save(db);
    return session;
  },

  async saveOnboardingDraft(step, draft) {
    const { db, user } = await requireSession();
    db.drafts[user.id] = { step, draft };
    save(db);
  },

  async getOnboardingDraft() {
    const { db, user } = await requireSession();
    return db.drafts[user.id] ?? null;
  },

  async completeOnboarding(input: OnboardingInput) {
    await delay(600);
    const ctx = await requireOrg();
    const { db, user, org, s, role } = ctx;
    if (role !== 'owner') throw new ApiError(403, 'Only the organization owner can complete setup.');
    org.name = input.organization.name;
    org.size = input.organization.size;
    org.industry = input.organization.industry;
    org.environmentType = input.infrastructure.environmentType;
    org.monitoringMode = input.monitoringMode;
    const { dataCenterName, environmentName } = input.infrastructure;
    const ws = input.monitoringMode === 'demo' ? sampleWorkspace(user.name, dataCenterName, environmentName) : emptyWorkspace(dataCenterName, environmentName);
    db.workspaces[org.id] = ws;
    for (const inv of input.invites) {
      await createInvitation(db, org, user, inv.email, inv.role);
    }
    audit(ws, user.name, 'Completed onboarding');
    user.onboardingCompleted = true;
    delete db.drafts[user.id];
    const session = buildSession(db, s);
    save(db);
    return session;
  },

  async skipOnboarding() {
    await delay();
    const { db, s, user } = await requireSession();
    user.onboardingCompleted = true;
    delete db.drafts[user.id];
    const session = buildSession(db, s);
    save(db);
    return session;
  },

  async updateOrganization(patch) {
    await delay();
    const { db, org, ws, user } = await requireOrg('org:manage');
    Object.assign(org, patch);
    audit(ws, user.name, 'Updated organization settings');
    save(db);
    return { ...org };
  },

  async changePlan(plan: PlanId) {
    await delay(500);
    const { db, org, ws, user } = await requireOrg('billing:manage');
    org.plan = plan;
    audit(ws, user.name, `Changed plan to ${plan} (demo, no charge)`);
    save(db);
    return { ...org };
  },

  async getWorkspace() {
    await delay(200);
    const { db, org, ws } = await requireOrg();
    save(db);
    return clone({ ...ws, members: members(db, org.id), invitations: db.invitations.filter((i) => i.orgId === org.id) });
  },

  async createIncident(input) {
    await delay();
    const { db, ws, user } = await requireOrg('incident:write');
    const now = new Date().toISOString();
    const id = nextIncidentId(ws.incidents);
    const rack = ws.racks.find((r) => r.id === input.rackId);
    const inc: Incident = {
      id, title: input.title, description: input.description, severity: input.severity, status: 'ongoing', category: input.category,
      serverIds: input.serverIds, rackId: input.rackId, dcId: rack?.dcId ?? ws.dataCenters[0]?.id ?? '', assigneeId: input.assigneeId,
      acknowledged: false, acknowledgedAt: null, createdAt: now, updatedAt: now, resolvedAt: null, source: 'manual',
      timeline: [{ id: randomId('t_'), at: now, type: 'created', actor: user.name, message: 'Incident created manually.' }],
      analysis: analysisFor(input.category),
    };
    if (input.assigneeId) {
      const a = db.users.find((u) => u.id === input.assigneeId);
      inc.timeline.push({ id: randomId('t_'), at: now, type: 'assigned', actor: user.name, message: `Assigned to ${a?.name ?? 'teammate'}.` });
    }
    ws.incidents.unshift(inc);
    audit(ws, user.name, `Created ${id}`);
    save(db);
    return clone(inc);
  },

  async updateIncident(id, action: IncidentAction) {
    await delay(250);
    const { db, ws, user, org } = await requireOrg('incident:write');
    const inc = ws.incidents.find((i) => i.id === id);
    if (!inc) throw new ApiError(404, 'Incident not found.');
    const now = new Date().toISOString();
    const add = (type: TimelineEvent['type'], message: string) => inc.timeline.push({ id: randomId('t_'), at: now, type, actor: user.name, message });
    switch (action.type) {
      case 'acknowledge':
        if (inc.status === 'resolved') throw new ApiError(400, 'Resolved incidents cannot be acknowledged.');
        inc.acknowledged = true; inc.acknowledgedAt = now;
        if (inc.status === 'ongoing') inc.status = 'investigating';
        add('status', 'Acknowledged and moved to Investigating.');
        break;
      case 'assign': {
        if (action.userId && !db.memberships.some((m) => m.orgId === org.id && m.userId === action.userId)) throw new ApiError(400, 'Assignee is not a member of this organization.');
        inc.assigneeId = action.userId;
        const a = db.users.find((u) => u.id === action.userId);
        add('assigned', action.userId ? `Assigned to ${a?.name}.` : 'Unassigned.');
        break;
      }
      case 'status':
        inc.status = action.status;
        add('status', `Status changed to ${action.status}.`);
        break;
      case 'resolve':
        if (inc.status === 'resolved') throw new ApiError(400, 'Incident is already resolved.');
        inc.status = 'resolved'; inc.resolvedAt = now; inc.acknowledged = true; inc.acknowledgedAt = inc.acknowledgedAt ?? now;
        add('resolved', action.note ? `Resolved: ${action.note}` : 'Resolved.');
        break;
      case 'reopen':
        if (inc.status !== 'resolved') throw new ApiError(400, 'Only resolved incidents can be reopened.');
        inc.status = 'ongoing'; inc.resolvedAt = null;
        add('reopened', action.reason ? `Reopened: ${action.reason}` : 'Reopened.');
        break;
      case 'comment':
        add('comment', action.message);
        break;
      case 'severity':
        add('severity', `Severity changed from ${inc.severity} to ${action.severity}.`);
        inc.severity = action.severity;
        break;
      case 'confirm_root_cause':
        inc.analysis = { ...inc.analysis, rootCause: action.rootCause, rootCauseStatus: 'confirmed', confirmedBy: user.name, confirmedAt: now };
        add('ai', `Root cause confirmed: ${action.rootCause}`);
        break;
      case 'refresh_analysis':
        add('ai', 'Sample analysis kept: no model runs in browser-only demo mode.');
        break;
    }
    inc.updatedAt = now;
    audit(ws, user.name, `${action.type} ${id}`);
    save(db);
    return clone(inc);
  },

  async updateAlert(id, action) {
    await delay(200);
    const { db, ws, user } = await requireOrg('alert:act');
    const alert = ws.alerts.find((a) => a.id === id);
    if (!alert) throw new ApiError(404, 'Alert not found.');
    if (action === 'acknowledge') { alert.status = 'acknowledged'; alert.acknowledgedBy = user.name; }
    else alert.status = 'dismissed';
    save(db);
    return { ...alert } as Alert;
  },

  async saveAlertRule(rule: AlertRule) {
    await delay();
    const { db, ws, user } = await requireOrg('alertRules:manage');
    const saved = { ...rule, id: rule.id || randomId('rule_') };
    const idx = ws.alertRules.findIndex((r) => r.id === saved.id);
    if (idx >= 0) ws.alertRules[idx] = saved; else ws.alertRules.push(saved);
    audit(ws, user.name, `Saved alert rule "${saved.name}"`);
    save(db);
    return saved;
  },

  async deleteAlertRule(id) {
    await delay();
    const { db, ws, user } = await requireOrg('alertRules:manage');
    ws.alertRules = ws.alertRules.filter((r) => r.id !== id);
    audit(ws, user.name, 'Deleted an alert rule');
    save(db);
  },

  async updateNotificationSettings(settings: NotificationSettings) {
    await delay();
    const { db, ws } = await requireOrg('alertRules:manage');
    ws.notificationSettings = { ...settings };
    save(db);
    return { ...settings };
  },

  async updateMonitoring(settings: MonitoringSettings) {
    await delay();
    const { db, ws } = await requireOrg('monitoring:manage');
    ws.monitoring = { ...settings };
    save(db);
    return { ...settings };
  },

  async inviteMember(email, role) {
    await delay();
    const { db, org, user, role: actorRole } = await requireOrg('team:manage');
    if (!assignableRoles(actorRole).includes(role)) throw new ApiError(403, 'You cannot invite members with that role.');
    const normalized = email.toLowerCase();
    if (members(db, org.id).some((m) => m.email === normalized)) throw new ApiError(409, 'That person is already a member.', 'already_member', { email: 'Already a member of this organization.' });
    if (db.invitations.some((i) => i.orgId === org.id && i.email === normalized && i.status === 'pending')) throw new ApiError(409, 'An invitation is already pending for that email.', 'already_invited', { email: 'An invitation is already pending.' });
    const inv = await createInvitation(db, org, user, normalized, role);
    save(db);
    return inv;
  },

  async changeMemberRole(userId, role) {
    await delay();
    const { db, org, ws, user, role: actorRole } = await requireOrg('team:manage');
    const m = db.memberships.find((x) => x.orgId === org.id && x.userId === userId);
    if (!m) throw new ApiError(404, 'Member not found.');
    if (userId === user.id) throw new ApiError(400, 'You cannot change your own role.');
    if (!canManageMember(actorRole, m.role) || !assignableRoles(actorRole).includes(role)) throw new ApiError(403, 'Your role cannot make this change.');
    if (m.role === 'owner' && role !== 'owner' && db.memberships.filter((x) => x.orgId === org.id && x.role === 'owner').length === 1) {
      throw new ApiError(400, 'An organization must keep at least one owner.');
    }
    m.role = role;
    audit(ws, user.name, `Changed role of ${db.users.find((u) => u.id === userId)?.email} to ${role}`);
    save(db);
    return members(db, org.id).find((x) => x.userId === userId)!;
  },

  async removeMember(userId) {
    await delay();
    const { db, org, ws, user, role: actorRole } = await requireOrg('team:manage');
    const m = db.memberships.find((x) => x.orgId === org.id && x.userId === userId);
    if (!m) throw new ApiError(404, 'Member not found.');
    if (userId === user.id) throw new ApiError(400, 'You cannot remove yourself.');
    if (!canManageMember(actorRole, m.role)) throw new ApiError(403, 'Your role cannot remove this member.');
    db.memberships = db.memberships.filter((x) => x !== m);
    db.sessions.forEach((s) => { if (s.userId === userId && s.orgId === org.id) s.orgId = null; });
    ws.incidents.forEach((i) => { if (i.assigneeId === userId) i.assigneeId = null; });
    audit(ws, user.name, `Removed ${db.users.find((u) => u.id === userId)?.email}`);
    save(db);
  },

  async revokeInvitation(id) {
    await delay();
    const { db, org } = await requireOrg('team:manage');
    const inv = db.invitations.find((i) => i.id === id && i.orgId === org.id);
    if (!inv) throw new ApiError(404, 'Invitation not found.');
    inv.status = 'revoked';
    db.tokens.forEach((t) => { if (t.inviteId === id) t.usedAt = Date.now(); });
    save(db);
  },

  async resendInvitation(id) {
    await delay();
    const { db, org, user } = await requireOrg('team:manage');
    const inv = db.invitations.find((i) => i.id === id && i.orgId === org.id);
    if (!inv || inv.status !== 'pending') throw new ApiError(400, 'Only pending invitations can be resent.');
    rateLimit(db, `invite-resend:${id}`, 3, HOUR);
    db.tokens.forEach((t) => { if (t.inviteId === id) t.usedAt = Date.now(); });
    const token = await issueToken(db, 'invite', inv.email, null, 7 * DAY, inv.id);
    inv.expiresAt = new Date(Date.now() + 7 * DAY).toISOString();
    pushMail(db, inv.email, `${user.name} invited you to ${org.name} on VaultWatch`, `Accept the invitation to join as ${inv.role}.`, `/accept-invitation?token=${token}`);
    save(db);
  },

  async createApiKey(name, scopes): Promise<CreatedApiKey> {
    await delay();
    const { db, ws, user } = await requireOrg('apiKeys:manage');
    const secret = `vw_mock_${randomToken()}`;
    const key: ApiKey = { id: randomId('key_'), name, prefix: secret.slice(0, 12), scopes, createdAt: new Date().toISOString(), lastUsedAt: null, createdBy: user.name };
    ws.apiKeys.push(key);
    db.apiKeyHashes[key.id] = await sha256(secret);
    audit(ws, user.name, `Created API key "${name}"`);
    save(db);
    return { key, secret };
  },

  async revokeApiKey(id) {
    await delay();
    const { db, ws, user } = await requireOrg('apiKeys:manage');
    ws.apiKeys = ws.apiKeys.filter((k) => k.id !== id);
    delete db.apiKeyHashes[id];
    audit(ws, user.name, 'Revoked an API key');
    save(db);
  },

  async checkBackendHealth(): Promise<BackendHealth> {
    const url = `${config.apiUrl || ''}/health`;
    const started = performance.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return { reachable: false, error: `Health check returned HTTP ${res.status}.` };
      const body = await res.json().catch(() => ({}));
      return { reachable: true, status: body?.data?.status ?? body?.status ?? 'ok', version: body?.data?.version, latencyMs: Math.round(performance.now() - started) };
    } catch {
      return { reachable: false, error: 'The FastAPI backend is not reachable from this browser. Mock mode keeps working without it.' };
    }
  },

  async loadSampleEnvironment() {
    await delay(400);
    await loadSampleEnvironment();
  },

  async removeSampleEnvironment() {
    await delay(300);
    const { db, org, user } = await requireOrg('infra:manage');
    const prev = db.workspaces[org.id]!;
    const next = emptyWorkspace();
    next.apiKeys = prev.apiKeys;
    next.alertRules = prev.alertRules;
    next.notificationSettings = prev.notificationSettings;
    next.monitoring = prev.monitoring;
    next.audit = prev.audit;
    audit(next, user.name, 'Removed the sample environment');
    db.workspaces[org.id] = next;
    org.monitoringMode = 'later';
    save(db);
  },

  async getIntegrationStatus(): Promise<IntegrationStatus> {
    await delay(150);
    const { ws } = await requireOrg();
    return {
      status: 'unavailable', database: 'unreachable', model: { ready: false, version: null, error: 'Browser-only demo mode: no backend or model.' },
      telemetry: ws.telemetry, email: { backend: 'mock', delivers: false }, slack: { configured: false }, pagerduty: { configured: false },
      logs: { configured: false }, billing: { configured: false },
    };
  },

  async getMetrics(serverId, window, metrics) {
    await delay(150);
    const { ws } = await requireOrg();
    const server = serverId ? ws.servers.find((s) => s.id === serverId) : undefined;
    if (serverId && !server) throw new ApiError(404, 'Server not found.');
    return sampleMetricSeries(server ?? null, ws.servers, window, metrics);
  },

  async getIncidentContext(id, window) {
    await delay(150);
    const { ws } = await requireOrg();
    const incident = ws.incidents.find((i) => i.id === id);
    if (!incident) throw new ApiError(404, 'Incident not found.');
    const server = ws.servers.find((s) => s.id === incident.serverIds[0]);
    return clone({
      incident,
      alerts: ws.alerts.filter((a) => a.serverId && incident.serverIds.includes(a.serverId)),
      predictions: ws.predictions.filter((p) => incident.serverIds.includes(p.serverId)),
      metrics: server ? sampleMetricSeries(server, ws.servers, window, ['cpu', 'memory', 'temperature', 'network']) : null,
      logs: { connected: false, lines: ws.sample ? sampleLogs(incident, server) : [], note: 'Sample log lines (browser-only demo mode).' },
    });
  },

  async runPredictions() {
    await delay(300);
    await requireOrg('predictions:run');
    return { servers: 0, scored: 0, skipped: 0, modelVersion: null };
  },

  async getReportSummary(from, to) {
    await delay(150);
    const { ws } = await requireOrg('reports:export');
    return mockReportSummary(ws, from, to);
  },

  async submitContact(_input: ContactInput) {
    await delay(500);
    const db = await loadDb();
    rateLimit(db, 'contact', 5, HOUR);
    save(db);
    // Mock mode has no mail transport, so nothing is delivered.
    return { delivered: false };
  },

  async listMail() {
    const db = await loadDb();
    return clone(db.mail);
  },
};

async function createInvitation(db: DB, org: Organization, inviter: MockUser, email: string, role: Role): Promise<Invitation> {
  const inv: Invitation = {
    id: randomId('inv_'), orgId: org.id, email: email.toLowerCase(), role, status: 'pending', invitedBy: inviter.name,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
  };
  db.invitations.push(inv);
  const token = await issueToken(db, 'invite', inv.email, null, 7 * DAY, inv.id);
  pushMail(db, inv.email, `${inviter.name} invited you to ${org.name} on VaultWatch`, `Accept the invitation to join as ${role}.`, `/accept-invitation?token=${token}`);
  const ws = db.workspaces[org.id];
  if (ws) audit(ws, inviter.name, `Invited ${inv.email} as ${role}`);
  return inv;
}

/** Load sample infrastructure into the current organization (Integrations → "Load sample environment"). */
async function loadSampleEnvironment() {
  const { db, org, user } = await requireOrg('infra:manage');
  const prev = db.workspaces[org.id]!;
  const next = sampleWorkspace(user.name, prev.dataCenters[0]?.name, prev.dataCenters[0]?.environment);
  next.apiKeys = prev.apiKeys;
  next.alertRules = prev.alertRules;
  next.notificationSettings = prev.notificationSettings;
  next.monitoring = prev.monitoring;
  next.audit = prev.audit;
  audit(next, user.name, 'Loaded sample environment');
  db.workspaces[org.id] = next;
  org.monitoringMode = 'demo';
  save(db);
}
