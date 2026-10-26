export type Role = 'owner' | 'admin' | 'engineer' | 'viewer';

export type Severity = 'critical' | 'major' | 'minor';
export type IncidentStatus = 'ongoing' | 'investigating' | 'resolved';
export type IncidentCategory = 'thermal' | 'power' | 'network' | 'hardware' | 'storage' | 'software' | 'capacity';
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'offline';

export interface UserPreferences {
  timezone: string;
  dateFormat: 'relative' | 'absolute';
  emailDigest: 'off' | 'daily' | 'weekly';
  compactTables: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  avatarColor: string;
  jobTitle?: string;
  createdAt: string;
  onboardingCompleted: boolean;
  preferences: UserPreferences;
}

export interface Organization {
  id: string;
  name: string;
  size: string;
  industry: string;
  plan: PlanId;
  environmentType: 'cloud' | 'on-premises' | 'hybrid';
  monitoringMode: 'demo' | 'connect' | 'later';
  createdAt: string;
  trialEndsAt: string;
}

export interface Membership {
  orgId: string;
  userId: string;
  role: Role;
  joinedAt: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  role: Role;
}

export interface Session {
  user: User;
  organization: Organization | null;
  role: Role | null;
  organizations: OrgSummary[];
  mode: 'mock' | 'api';
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  avatarColor: string;
  lastActive?: string;
}

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface InvitationDetails {
  invitation: Invitation;
  organizationName: string;
  inviterName: string;
  accountExists: boolean;
}

export interface DataCenter {
  id: string;
  name: string;
  location: string;
  environment: string;
}

export interface Rack {
  id: string;
  label: string;
  dcId: string;
  row: string;
  position: number;
  powerKw: number;
  powerCapacityKw: number;
  inletTemp: number;
  status: HealthStatus;
}

export interface Server {
  id: string;
  hostname: string;
  rackId: string;
  dcId: string;
  slot: number;
  role: string;
  ip: string;
  model: string;
  cpu: number;
  memory: number;
  storage: number;
  temperature: number;
  powerW: number;
  networkLatencyMs: number;
  connectivity: 'online' | 'degraded' | 'offline';
  status: HealthStatus;
  uptimeDays: number;
}

export interface TimelineEvent {
  id: string;
  at: string;
  type: 'created' | 'assigned' | 'status' | 'comment' | 'ai' | 'severity' | 'resolved' | 'reopened';
  actor: string;
  message: string;
}

export interface AIAnalysis {
  summary: string;
  rootCause: string;
  rootCauseConfidence: number;
  contributingFactors: { label: string; weight: number }[];
  remediation: string[];
  relatedIncidentIds: string[];
  generatedBy: 'sample' | 'model';
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  category: IncidentCategory;
  serverIds: string[];
  rackId: string;
  dcId: string;
  assigneeId: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  source: 'ai' | 'rule' | 'manual';
  timeline: TimelineEvent[];
  analysis: AIAnalysis;
}

export interface NewIncidentInput {
  title: string;
  description: string;
  severity: Severity;
  category: IncidentCategory;
  rackId: string;
  serverIds: string[];
  assigneeId: string | null;
}

export type PredictionHorizon = '6h' | '24h' | '72h' | '7d';

export interface Prediction {
  id: string;
  serverId: string;
  rackId: string;
  dcId: string;
  type: string;
  probability: number;
  confidence: number;
  horizon: PredictionHorizon;
  expectedAt: string;
  factors: { label: string; weight: number; value: string }[];
  recommendation: string;
  generatedAt: string;
  sample: boolean;
}

export interface ModelInfo {
  name: string;
  version: string;
  confidence: number;
  trainedAt: string;
  sample: boolean;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  serverId: string | null;
  ruleId: string | null;
  createdAt: string;
  acknowledgedBy: string | null;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: 'cpu' | 'memory' | 'temperature' | 'power' | 'latency' | 'storage';
  operator: '>' | '<';
  threshold: number;
  durationMin: number;
  severity: AlertSeverity;
  enabled: boolean;
  channels: ('email' | 'slack' | 'webhook' | 'pagerduty')[];
}

export interface NotificationSettings {
  email: boolean;
  slack: boolean;
  webhook: boolean;
  pagerduty: boolean;
  slackChannel: string;
  webhookUrl: string;
  quietHours: boolean;
  minSeverity: AlertSeverity;
}

export interface MonitoringSettings {
  scrapeIntervalSec: number;
  retentionDays: number;
  anomalySensitivity: 'low' | 'medium' | 'high';
  predictionHorizon: PredictionHorizon;
  autoCreateIncidents: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  createdBy: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
}

export type PlanId = 'trial' | 'team' | 'business';

export interface UserSession {
  id: string;
  device: string;
  location: string;
  createdAt: string;
  lastActive: string;
  current: boolean;
}

export interface MailMessage {
  id: string;
  to: string;
  subject: string;
  body: string;
  link: string;
  createdAt: string;
}

export interface Workspace {
  dataCenters: DataCenter[];
  racks: Rack[];
  servers: Server[];
  incidents: Incident[];
  predictions: Prediction[];
  model: ModelInfo | null;
  alerts: Alert[];
  alertRules: AlertRule[];
  notificationSettings: NotificationSettings;
  monitoring: MonitoringSettings;
  apiKeys: ApiKey[];
  members: Member[];
  invitations: Invitation[];
  audit: AuditEntry[];
  sample: boolean;
}
