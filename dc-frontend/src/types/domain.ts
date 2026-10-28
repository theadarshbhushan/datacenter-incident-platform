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
  sample?: boolean;
}

export interface Rack {
  id: string;
  label: string;
  dcId: string;
  row: string;
  position: number;
  /** Sum of reported server power draw; null when no server reports power. */
  powerKw: number | null;
  powerCapacityKw: number;
  /** Not measured by the agent; null unless an integration provides it. */
  inletTemp: number | null;
  /** Hottest server reading in the rack. */
  maxTemp?: number | null;
  status: HealthStatus;
  sample?: boolean;
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
  /** Latest readings. null means the server does not report that metric. */
  cpu: number | null;
  memory: number | null;
  storage: number | null;
  temperature: number | null;
  powerW: number | null;
  networkLatencyMs: number | null;
  networkMbps?: number | null;
  diskIoMbps?: number | null;
  connectivity: 'online' | 'degraded' | 'offline';
  status: HealthStatus;
  uptimeDays: number;
  agentId?: string;
  lastSeenAt?: string | null;
  source?: 'agent' | 'manual' | 'demo';
  sample?: boolean;
  /** Latest anomaly score (percentile, 0-1). Not a probability. */
  anomalyScore?: number | null;
  assessment?: 'normal' | 'warning' | 'critical' | 'insufficient_data';
  assessedAt?: string | null;
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
  /** Suspected until a person confirms it on the incident. */
  rootCause: string;
  rootCauseStatus?: 'suspected' | 'confirmed' | 'unknown';
  evidenceStrength?: 'none' | 'moderate' | 'strong';
  evidence?: string[];
  /** Only present on sample analyses (illustrative text, not computed). */
  rootCauseConfidence?: number;
  contributingFactors: { label: string; weight: number; value?: string }[];
  remediation: string[];
  relatedIncidentIds: string[];
  generatedBy: 'sample' | 'rules' | 'model';
  generatedAt?: string;
  modelVersion?: string | null;
  confirmedBy?: string;
  confirmedAt?: string;
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
  sample?: boolean;
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

export type PredictionHorizon = 'now' | '1h' | '6h' | '24h' | '72h' | '7d';

export interface PredictionFactor { label: string; metric?: string | null; weight: number; value: string }

/**
 * Model output for one server.
 * - kind "anomaly": detects unusual behavior now (horizon "now"). anomalyScore is a percentile, NOT a probability.
 * - kind "early_warning": experimental forecast of a metric surge in the next hour. riskScore is the model output;
 *   probability is only set when the model's calibration passed its held-out test.
 * - severity is an operating decision from fixed thresholds; confidence describes how much data backs the result.
 */
export interface Prediction {
  id: string;
  serverId: string;
  rackId: string;
  dcId: string;
  kind: 'anomaly' | 'early_warning';
  type: string;
  category: IncidentCategory;
  metric: string | null;
  severity: 'normal' | 'warning' | 'critical';
  anomalyScore: number | null;
  riskScore: number | null;
  probability: number | null;
  probabilityCalibrated: boolean;
  horizon: PredictionHorizon;
  confidence: 'low' | 'medium' | 'high';
  confidenceReason: string;
  factors: PredictionFactor[];
  recommendation: string;
  modelVersion: string;
  experimental: boolean;
  generatedAt: string;
  dataTime: string;
  expectedAt: string | null;
  sample: boolean;
}

export interface ModelEvaluationPoint { precision: number; recall: number; f1: number; false_positive_rate: number; windows_detected: number; windows_total: number; false_alarm_episodes_per_day: number }

export interface ModelInfo {
  name: string;
  version: string | null;
  trainedAt: string | null;
  ready: boolean;
  error?: string;
  /** True only for the browser-only demo (VITE_API_MODE=mock), where no model runs. */
  sample: boolean;
  earlyWarning?: { available: boolean; experimental: boolean; probabilityCalibrated: boolean; horizonMinutes: number };
  evaluation?: {
    anomaly_loso_at_warning?: ModelEvaluationPoint;
    anomaly_loso_at_critical?: ModelEvaluationPoint;
    anomaly_loso_alert_rule?: ModelEvaluationPoint;
    anomaly_pr_auc_pooled?: number;
    early_warning?: { pr_auc: number; base_rate: number; brier_skill_score: number; expected_calibration_error: number } | null;
    early_warning_status?: string;
    probability_is_calibrated?: boolean;
  };
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
  lastSeenAt?: string;
  sample?: boolean;
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

export interface TelemetryHealth {
  /** live: real telemetry in the last 5 minutes. stale: had telemetry, none recently. demo: sample data only. waiting: nothing yet. */
  status: 'live' | 'stale' | 'demo' | 'waiting';
  lastReceivedAt: string | null;
  serversReporting: number;
  serversTotal: number;
  demoServers: number;
  acceptedLastHour: number;
  rejectedLastHour: number;
  accepted24h: number;
  rejected24h: number;
  lastError: string | null;
}

export type MetricKey = 'cpu' | 'memory' | 'storage' | 'disk_io' | 'network' | 'temperature' | 'power' | 'latency';

export interface MetricSeries {
  window: '1h' | '6h' | '24h' | '7d';
  bucketSeconds: number;
  from: string;
  to: string;
  metrics: MetricKey[];
  servers: number;
  points: ({ at: string } & Partial<Record<MetricKey, number | null>>)[];
  sample?: boolean;
}

export interface IncidentContext {
  incident: Incident;
  alerts: Alert[];
  predictions: Prediction[];
  metrics: MetricSeries | null;
  logs: { connected: boolean; lines: { at: string; level: string; host: string; msg: string }[]; note: string };
}

export interface ReportSummary {
  from: string;
  to: string;
  generatedAt: string;
  sample: boolean;
  incidents: {
    created: number; resolved: number; activeNow: number;
    bySeverity: Partial<Record<Severity, number>>; byCategory: Partial<Record<IncidentCategory, number>>;
    byStatus: Partial<Record<IncidentStatus, number>>; bySource: Partial<Record<Incident['source'], number>>;
    mttrMinutes: number | null; mttaMinutes: number | null; downtimeMinutes: number;
  };
  uptime: { estimated: number; servers: number; definition: string };
  daily: { date: string; critical: number; major: number; minor: number; uptime: number }[];
  alerts: { created: number; bySeverity: Partial<Record<AlertSeverity, number>>; byStatus: Record<string, number> };
  servers: { total: number; byStatus: Partial<Record<HealthStatus, number>> };
  predictions: { current: number; anomaliesBySeverity: Record<string, number>; earlyWarningsFlagged: number };
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
  telemetry: TelemetryHealth;
  sample: boolean;
}
