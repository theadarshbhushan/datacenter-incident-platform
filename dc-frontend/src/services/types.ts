import type {
  AlertRule, ApiKey, IncidentStatus, InvitationDetails, MailMessage, MonitoringSettings, NewIncidentInput,
  NotificationSettings, Organization, PlanId, Role, Session, User, UserPreferences, UserSession, Workspace,
  Incident, Alert, Member, Invitation,
} from '@/types/domain';

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, message: string, code = 'error', fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  return fallback;
}

export interface LoginInput { email: string; password: string; remember: boolean }
export interface SignupInput { name: string; email: string; company: string; password: string; ref?: string }
/**
 * Signup never signs the visitor in and answers the same way whether or not the email is already
 * registered, so the form cannot be used to discover accounts. The emailed link continues the flow.
 */
export interface SignupResult { session: Session | null; verificationRequired: boolean }

export type TokenState = 'valid' | 'expired' | 'invalid' | 'used';
export type VerifyResult = 'verified' | 'already-verified' | 'expired' | 'invalid';

export interface OnboardingInput {
  organization: { name: string; size: string; industry: string };
  infrastructure: { dataCenterName: string; environmentName: string; serverCount: number; environmentType: Organization['environmentType'] };
  monitoringMode: Organization['monitoringMode'];
  invites: { email: string; role: Role }[];
}

export type IncidentAction =
  | { type: 'acknowledge' }
  | { type: 'assign'; userId: string | null }
  | { type: 'status'; status: IncidentStatus }
  | { type: 'resolve'; note?: string }
  | { type: 'reopen'; reason?: string }
  | { type: 'comment'; message: string };

export interface ContactInput { name: string; email: string; company: string; subject: string; message: string }

export interface BackendHealth { reachable: boolean; status?: string; version?: string; latencyMs?: number; error?: string }

export interface CreatedApiKey { key: ApiKey; secret: string }

export interface ApiClient {
  mode: 'mock' | 'api';

  // Auth & session
  getSession(): Promise<Session | null>;
  login(input: LoginInput): Promise<Session>;
  signup(input: SignupInput): Promise<SignupResult>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  checkResetToken(token: string): Promise<TokenState>;
  resetPassword(token: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<VerifyResult>;
  resendVerification(email?: string): Promise<void>;
  getInvitation(token: string): Promise<InvitationDetails | TokenState>;
  acceptInvitation(token: string, account?: { name: string; password: string }): Promise<Session>;
  declineInvitation(token: string): Promise<void>;

  // Profile
  updateProfile(patch: { name?: string; jobTitle?: string; avatarColor?: string; preferences?: Partial<UserPreferences> }): Promise<User>;
  changePassword(current: string, next: string): Promise<void>;
  listSessions(): Promise<UserSession[]>;
  revokeSession(id: string): Promise<void>;

  // Organization & onboarding
  switchOrganization(orgId: string): Promise<Session>;
  saveOnboardingDraft(step: number, draft: unknown): Promise<void>;
  getOnboardingDraft(): Promise<{ step: number; draft: unknown } | null>;
  completeOnboarding(input: OnboardingInput): Promise<Session>;
  skipOnboarding(): Promise<Session>;
  updateOrganization(patch: Partial<Pick<Organization, 'name' | 'size' | 'industry' | 'environmentType'>>): Promise<Organization>;
  changePlan(plan: PlanId): Promise<Organization>;

  // Workspace data
  getWorkspace(): Promise<Workspace>;
  createIncident(input: NewIncidentInput): Promise<Incident>;
  updateIncident(id: string, action: IncidentAction): Promise<Incident>;
  updateAlert(id: string, action: 'acknowledge' | 'dismiss'): Promise<Alert>;
  saveAlertRule(rule: AlertRule): Promise<AlertRule>;
  deleteAlertRule(id: string): Promise<void>;
  updateNotificationSettings(s: NotificationSettings): Promise<NotificationSettings>;
  updateMonitoring(s: MonitoringSettings): Promise<MonitoringSettings>;

  // Team
  inviteMember(email: string, role: Role): Promise<Invitation>;
  changeMemberRole(userId: string, role: Role): Promise<Member>;
  removeMember(userId: string): Promise<void>;
  revokeInvitation(id: string): Promise<void>;
  resendInvitation(id: string): Promise<void>;

  // Integrations
  createApiKey(name: string, scopes: string[]): Promise<CreatedApiKey>;
  revokeApiKey(id: string): Promise<void>;
  checkBackendHealth(): Promise<BackendHealth>;
  /** Replace the current organization's infrastructure with clearly labeled sample data. */
  loadSampleEnvironment(): Promise<void>;

  // Public
  submitContact(input: ContactInput): Promise<{ delivered: boolean }>;

  // Mock-only developer mailbox (no real email is sent in mock mode)
  listMail(): Promise<MailMessage[]>;
}
