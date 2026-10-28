import type {
  MetricKey, MetricSeries,
  AIAnalysis, Alert, AlertRule, DataCenter, Incident, IncidentCategory, ModelInfo, MonitoringSettings,
  NotificationSettings, Prediction, Rack, Server, Severity, IncidentStatus, HealthStatus,
} from '@/types/domain';
import { mulberry32 } from '@/utils/random';

/*
 * Sample data for mock mode and the "Demo environment" onboarding option.
 * Everything here is illustrative. Nothing is produced by a live model.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const demoDataCenters: DataCenter[] = [
  { id: 'dc-east', name: 'DC1', location: 'Mumbai', environment: 'Production' },
  { id: 'dc-west', name: 'DC2', location: 'Bengaluru', environment: 'Production' },
];

const roles = ['Database', 'App server', 'Cache', 'Kafka broker', 'ML inference', 'Storage', 'Edge proxy', 'Compute'];
const models = ['Dell R760', 'HPE DL380 Gen11', 'Supermicro SYS-221H', 'Lenovo SR650 V3'];

// Servers that the sample incidents and predictions are about, with forced readings.
const hotspots: Record<string, Partial<Server>> = {
  'srv-a02-3': { cpu: 94, memory: 88, temperature: 82, status: 'critical', connectivity: 'degraded' },
  'srv-b01-2': { cpu: 71, memory: 92, temperature: 63, status: 'warning' },
  'srv-a03-1': { cpu: 64, memory: 58, temperature: 76, status: 'warning' },
  'srv-c02-4': { cpu: 18, memory: 22, temperature: 41, status: 'offline', connectivity: 'offline' },
};

export function buildInfrastructure(): { racks: Rack[]; servers: Server[] } {
  const rand = mulberry32(42);
  const racks: Rack[] = [];
  const servers: Server[] = [];
  const layout: Record<string, string[]> = {
    'dc-east': ['A01', 'A02', 'A03', 'B01', 'B02', 'B03'],
    'dc-west': ['C01', 'C02', 'D01', 'D02'],
  };
  for (const [dcId, labels] of Object.entries(layout)) {
    labels.forEach((label, idx) => {
      const rackId = `rack-${label.toLowerCase()}`;
      const rackServers: Server[] = [];
      for (let slot = 1; slot <= 4; slot++) {
        const id = `srv-${label.toLowerCase()}-${slot}`;
        const base: Server = {
          id,
          hostname: `${dcId === 'dc-east' ? 'ash' : 'hio'}-${label.toLowerCase()}-${String(slot).padStart(2, '0')}`,
          rackId,
          dcId,
          slot,
          role: roles[Math.floor(rand() * roles.length)]!,
          ip: `10.${dcId === 'dc-east' ? 1 : 2}.${idx + 1}.${10 + slot}`,
          model: models[Math.floor(rand() * models.length)]!,
          cpu: Math.round(22 + rand() * 40),
          memory: Math.round(35 + rand() * 35),
          storage: Math.round(30 + rand() * 45),
          temperature: Math.round(38 + rand() * 14),
          powerW: Math.round(380 + rand() * 320),
          networkLatencyMs: Math.round((0.3 + rand() * 1.4) * 10) / 10,
          connectivity: 'online',
          status: 'healthy',
          uptimeDays: Math.round(20 + rand() * 300),
        };
        const server = { ...base, ...hotspots[id] };
        rackServers.push(server);
      }
      servers.push(...rackServers);
      const worst = worstStatus(rackServers.map((s) => s.status));
      const powerKw = Math.round(rackServers.reduce((a, s) => a + (s.powerW ?? 0), 0) / 100) / 10;
      racks.push({
        id: rackId,
        label,
        dcId,
        row: label[0]!,
        position: Number(label.slice(1)),
        powerKw,
        powerCapacityKw: 8,
        inletTemp: null,
        maxTemp: Math.max(...rackServers.map((s) => s.temperature ?? 0)),
        status: worst,
        sample: true,
      });
    });
  }
  return { racks, servers };
}

function worstStatus(list: HealthStatus[]): HealthStatus {
  if (list.includes('critical')) return 'critical';
  if (list.includes('offline')) return 'warning';
  if (list.includes('warning')) return 'warning';
  return 'healthy';
}

interface IncidentSeed {
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  category: IncidentCategory;
  serverId: string;
  hoursAgo: number;
  resolvedAfterH?: number;
  source: Incident['source'];
}

const activeSeeds: IncidentSeed[] = [
  {
    title: 'CPU saturation and thermal rise on ash-a02-03',
    description: 'Sustained CPU above 90% with inlet temperature climbing past 80°C. Correlated with a batch job deployed at 09:40.',
    severity: 'critical', status: 'ongoing', category: 'thermal', serverId: 'srv-a02-3', hoursAgo: 0.4, source: 'ai',
  },
  {
    title: 'Memory pressure on Kafka broker ash-b01-02',
    description: 'Heap usage has grown steadily for 6 hours. Consumer lag rising on two partitions.',
    severity: 'major', status: 'investigating', category: 'software', serverId: 'srv-b01-2', hoursAgo: 2.5, source: 'rule',
  },
  {
    title: 'Elevated inlet temperature in rack A03',
    description: 'CRAC unit 2 reports reduced airflow. Rack A03 inlet temperature 6°C above baseline.',
    severity: 'major', status: 'ongoing', category: 'thermal', serverId: 'srv-a03-1', hoursAgo: 5, source: 'ai',
  },
  {
    title: 'Node hio-c02-04 unreachable',
    description: 'Host stopped responding to health checks. Out-of-band management reachable; PSU fault suspected.',
    severity: 'minor', status: 'investigating', category: 'power', serverId: 'srv-c02-4', hoursAgo: 9, source: 'rule',
  },
];

const historyTemplates: Omit<IncidentSeed, 'hoursAgo' | 'status' | 'serverId'>[] = [
  { title: 'Disk latency spike on storage volume', description: 'p99 write latency exceeded 40 ms for 12 minutes.', severity: 'major', category: 'storage', source: 'rule' },
  { title: 'Packet loss on top-of-rack switch uplink', description: 'Intermittent 2–4% packet loss on uplink port 49.', severity: 'major', category: 'network', source: 'ai' },
  { title: 'Fan failure reported by BMC', description: 'Fan 3 reported 0 RPM. Remaining fans compensated.', severity: 'minor', category: 'hardware', source: 'rule' },
  { title: 'PDU branch circuit near capacity', description: 'Branch B at 87% of rated load during peak.', severity: 'major', category: 'power', source: 'ai' },
  { title: 'Certificate expiry on internal API gateway', description: 'TLS certificate expired, causing 5xx for internal clients.', severity: 'critical', category: 'software', source: 'manual' },
  { title: 'CPU throttling under thermal limit', description: 'Processor throttled after sustained 95% load.', severity: 'minor', category: 'thermal', source: 'ai' },
  { title: 'RAID array degraded', description: 'One member disk failed; rebuild completed after replacement.', severity: 'major', category: 'storage', source: 'rule' },
  { title: 'DNS resolution timeouts', description: 'Resolver pool saturated during deploy window.', severity: 'minor', category: 'network', source: 'manual' },
  { title: 'Capacity threshold reached on compute pool', description: 'Pool reached 85% allocated vCPU.', severity: 'minor', category: 'capacity', source: 'ai' },
  { title: 'UPS switched to battery', description: 'Utility power dip for 40 seconds; UPS carried the load.', severity: 'critical', category: 'power', source: 'rule' },
];

const analysisByCategory: Record<IncidentCategory, Omit<AIAnalysis, 'relatedIncidentIds' | 'generatedBy'>> = {
  thermal: {
    summary: 'Temperature and CPU load rose together, following a workload change and reduced cooling airflow in the same row.',
    rootCause: 'Reduced airflow from CRAC unit 2 combined with a new CPU-heavy batch workload.',
    rootCauseConfidence: 0.82,
    contributingFactors: [
      { label: 'CPU utilization', weight: 0.38 },
      { label: 'Inlet temperature', weight: 0.31 },
      { label: 'Airflow (CRAC 2)', weight: 0.19 },
      { label: 'Fan speed', weight: 0.12 },
    ],
    remediation: [
      'Throttle or reschedule the batch job to off-peak hours.',
      'Migrate latency-sensitive workloads to rack B02, which has spare thermal headroom.',
      'Dispatch facilities to inspect CRAC unit 2 filters and airflow.',
      'Raise fan profile to "performance" until airflow is restored.',
    ],
  },
  software: {
    summary: 'Memory usage grew linearly without plateau, consistent with a leak introduced in the latest deploy.',
    rootCause: 'Probable memory leak in consumer client v3.4.1 deployed 6 hours before onset.',
    rootCauseConfidence: 0.74,
    contributingFactors: [
      { label: 'Heap growth rate', weight: 0.44 },
      { label: 'Recent deployment', weight: 0.29 },
      { label: 'GC pause time', weight: 0.17 },
      { label: 'Consumer lag', weight: 0.1 },
    ],
    remediation: [
      'Roll back consumer client to v3.4.0.',
      'Restart the broker during the next low-traffic window to reclaim memory.',
      'Capture a heap dump before restart for the application team.',
    ],
  },
  power: {
    summary: 'Power telemetry stopped abruptly while out-of-band management stayed reachable, pointing to a PSU fault.',
    rootCause: 'Primary power supply unit failure; redundant PSU not cabled to the B feed.',
    rootCauseConfidence: 0.69,
    contributingFactors: [
      { label: 'PSU voltage drop', weight: 0.47 },
      { label: 'Single power feed', weight: 0.33 },
      { label: 'PSU age', weight: 0.2 },
    ],
    remediation: [
      'Replace the failed PSU and cable the redundant PSU to the B feed.',
      'Audit the rack for other servers on a single feed.',
    ],
  },
  network: {
    summary: 'Packet loss correlates with CRC errors on one uplink, suggesting a physical layer issue.',
    rootCause: 'Degraded optic on uplink port 49.',
    rootCauseConfidence: 0.77,
    contributingFactors: [
      { label: 'CRC errors', weight: 0.52 },
      { label: 'Optic RX power', weight: 0.31 },
      { label: 'Link flaps', weight: 0.17 },
    ],
    remediation: ['Replace the optic on port 49.', 'Shift traffic to the secondary uplink until replaced.'],
  },
  hardware: {
    summary: 'BMC sensor data shows a single component failure with redundancy still in place.',
    rootCause: 'Fan module failure.',
    rootCauseConfidence: 0.88,
    contributingFactors: [{ label: 'Fan RPM', weight: 0.7 }, { label: 'Component age', weight: 0.3 }],
    remediation: ['Replace the fan module during the next maintenance window.'],
  },
  storage: {
    summary: 'Write latency rose with queue depth on one volume while other volumes stayed normal.',
    rootCause: 'Degraded disk in RAID set increasing rebuild I/O.',
    rootCauseConfidence: 0.71,
    contributingFactors: [{ label: 'Queue depth', weight: 0.45 }, { label: 'SMART reallocated sectors', weight: 0.35 }, { label: 'Rebuild I/O', weight: 0.2 }],
    remediation: ['Replace the failing disk.', 'Throttle rebuild priority during business hours.'],
  },
  capacity: {
    summary: 'Allocation trend projects pool exhaustion within two weeks at current growth.',
    rootCause: 'Organic growth without matching capacity planning.',
    rootCauseConfidence: 0.8,
    contributingFactors: [{ label: 'Allocation growth', weight: 0.6 }, { label: 'Reserved headroom', weight: 0.4 }],
    remediation: ['Order additional compute nodes.', 'Reclaim idle reservations.'],
  },
};

export function analysisFor(category: IncidentCategory, related: string[] = []): AIAnalysis {
  return { ...analysisByCategory[category], relatedIncidentIds: related, generatedBy: 'sample' };
}

export function buildIncidents(servers: Server[], now = Date.now(), ownerName = 'System'): Incident[] {
  const rand = mulberry32(7);
  const byId = new Map(servers.map((s) => [s.id, s]));
  const seeds: IncidentSeed[] = [...activeSeeds];
  // 38 resolved incidents over the last 30 days → 42 total, matching the report reference.
  for (let i = 0; i < 38; i++) {
    const t = historyTemplates[i % historyTemplates.length]!;
    const server = servers[Math.floor(rand() * servers.length)]!;
    seeds.push({
      ...t,
      serverId: server.id,
      status: 'resolved',
      hoursAgo: 12 + rand() * 29 * 24,
      resolvedAfterH: 0.3 + rand() * 6,
    });
  }
  seeds.sort((a, b) => a.hoursAgo - b.hoursAgo);
  const year = new Date(now).getFullYear();
  return seeds.map((seed, idx) => {
    const server = byId.get(seed.serverId)!;
    const createdAt = new Date(now - seed.hoursAgo * HOUR).toISOString();
    const resolvedAt = seed.status === 'resolved' ? new Date(now - (seed.hoursAgo - (seed.resolvedAfterH ?? 1)) * HOUR).toISOString() : null;
    const id = `INC-${year}-${String(134 - idx).padStart(4, '0')}`;
    const ack = seed.status !== 'ongoing';
    const timeline: Incident['timeline'] = [
      { id: `${id}-t1`, at: createdAt, type: 'created', actor: seed.source === 'manual' ? ownerName : 'VaultWatch', message: seed.source === 'ai' ? 'Incident opened by anomaly detection (sample model).' : seed.source === 'rule' ? 'Incident opened by alert rule.' : 'Incident created manually.' },
      { id: `${id}-t2`, at: new Date(new Date(createdAt).getTime() + 2 * 60000).toISOString(), type: 'ai', actor: 'VaultWatch', message: 'Sample AI analysis attached with probable root cause.' },
    ];
    if (ack) timeline.push({ id: `${id}-t3`, at: new Date(new Date(createdAt).getTime() + 9 * 60000).toISOString(), type: 'status', actor: ownerName, message: 'Acknowledged and moved to Investigating.' });
    if (resolvedAt) timeline.push({ id: `${id}-t4`, at: resolvedAt, type: 'resolved', actor: ownerName, message: 'Resolved after remediation.' });
    return {
      id,
      title: seed.title.replace(/ash-[a-z0-9-]+|hio-[a-z0-9-]+/, server.hostname),
      description: seed.description,
      severity: seed.severity,
      status: seed.status,
      category: seed.category,
      serverIds: [server.id],
      rackId: server.rackId,
      dcId: server.dcId,
      assigneeId: null,
      acknowledged: ack,
      acknowledgedAt: ack ? timeline[2]?.at ?? null : null,
      createdAt,
      updatedAt: resolvedAt ?? timeline[timeline.length - 1]!.at,
      resolvedAt,
      source: seed.source,
      timeline,
      analysis: analysisFor(seed.category),
    } satisfies Incident;
  });
}

const metricTypes: { metric: string; label: string; type: string; category: IncidentCategory; unit: string; rec: string }[] = [
  { metric: 'temperature', label: 'Temperature', type: 'Thermal anomaly', category: 'thermal', unit: '°C', rec: 'Check fans, airflow and inlet temperature for the rack; move heavy workloads if it keeps rising.' },
  { metric: 'memory', label: 'Memory', type: 'Memory anomaly', category: 'software', unit: '%', rec: 'Look for a memory leak or a recent deploy; restart the service in a quiet window if memory keeps climbing.' },
  { metric: 'cpu', label: 'CPU', type: 'CPU anomaly', category: 'capacity', unit: '%', rec: 'Check which process or job drove CPU up, and move or throttle it if the server is saturated.' },
  { metric: 'network', label: 'Network throughput', type: 'Network traffic anomaly', category: 'network', unit: ' Mb/s', rec: 'Check the switch port, uplink errors and traffic sources for this server.' },
];

/**
 * Browser-only demo (VITE_API_MODE=mock): illustrative predictions in the same shape the API returns.
 * No model runs here. With the backend, predictions come from the trained model (see dc-backend/app/ml).
 */
export function buildPredictions(servers: Server[], now = Date.now()): Prediction[] {
  const rand = mulberry32(99);
  const forced: Record<string, [number, number, 'warning' | 'critical']> = {
    // serverId: [metric index, anomaly score, severity]
    'srv-a02-3': [0, 0.99, 'critical'],
    'srv-b01-2': [1, 0.98, 'warning'],
    'srv-a03-1': [0, 0.97, 'warning'],
  };
  const out: Prediction[] = [];
  servers.filter((s) => s.connectivity !== 'offline').forEach((s, i) => {
    const f = forced[s.id];
    const t = metricTypes[f ? f[0] : Math.floor(rand() * metricTypes.length)]!;
    const score = f ? f[1] : Math.round((0.1 + rand() * 0.75) * 100) / 100;
    const common = {
      serverId: s.id, rackId: s.rackId, dcId: s.dcId, category: t.category, metric: t.metric, modelVersion: 'sample',
      confidence: 'medium' as const, confidenceReason: 'Sample prediction: no model runs in browser-only demo mode.',
      generatedAt: new Date(now - 4 * 60000).toISOString(), dataTime: new Date(now - 5 * 60000).toISOString(), sample: true,
      factors: [{ label: t.label, metric: t.metric, weight: score, value: `${t.metric === 'cpu' ? s.cpu : t.metric === 'memory' ? s.memory : t.metric === 'temperature' ? s.temperature : 180}${t.unit}` }],
      recommendation: t.rec,
    };
    out.push({ ...common, id: `pred-${i + 1}`, kind: 'anomaly', type: t.type, severity: f ? f[2] : score > 0.9 ? 'warning' : 'normal', anomalyScore: score,
      riskScore: null, probability: null, probabilityCalibrated: false, horizon: 'now', experimental: false, expectedAt: null });
    const risk = f ? 0.62 : Math.round(rand() * 0.2 * 100) / 100;
    out.push({ ...common, id: `pred-ew-${i + 1}`, kind: 'early_warning', type: `${t.label} surge`, severity: risk >= 0.3 ? 'warning' : 'normal', anomalyScore: null,
      riskScore: risk, probability: null, probabilityCalibrated: false, horizon: '1h', experimental: true, expectedAt: new Date(now + HOUR).toISOString() });
  });
  return out;
}

export const demoModel = (): ModelInfo => ({
  name: 'Sample predictions (no model runs in browser-only demo mode)',
  version: null,
  trainedAt: null,
  ready: false,
  sample: true,
});

export function buildAlerts(now = Date.now()): Alert[] {
  const mk = (i: number, a: Omit<Alert, 'id' | 'createdAt'> & { minsAgo: number }): Alert => {
    const { minsAgo, ...rest } = a;
    return { id: `alt-${i}`, createdAt: new Date(now - minsAgo * 60000).toISOString(), ...rest };
  };
  return [
    mk(1, { title: 'CPU above 90% for 10 min', message: 'ash-a02-03 CPU at 94%.', severity: 'critical', status: 'active', serverId: 'srv-a02-3', ruleId: 'rule-cpu', acknowledgedBy: null, minsAgo: 18 }),
    mk(2, { title: 'Temperature above 80°C', message: 'ash-a02-03 inlet at 82°C.', severity: 'critical', status: 'active', serverId: 'srv-a02-3', ruleId: 'rule-temp', acknowledgedBy: null, minsAgo: 22 }),
    mk(3, { title: 'Memory above 90%', message: 'ash-b01-02 memory at 92%.', severity: 'warning', status: 'acknowledged', serverId: 'srv-b01-2', ruleId: 'rule-mem', acknowledgedBy: 'System', minsAgo: 150 }),
    mk(4, { title: 'Host unreachable', message: 'hio-c02-04 failed 3 consecutive health checks.', severity: 'warning', status: 'active', serverId: 'srv-c02-4', ruleId: null, acknowledgedBy: null, minsAgo: 540 }),
    mk(5, { title: 'Rack A03 inlet above baseline', message: 'Inlet 6°C above 7-day baseline.', severity: 'warning', status: 'active', serverId: 'srv-a03-1', ruleId: 'rule-temp', acknowledgedBy: null, minsAgo: 300 }),
    mk(6, { title: 'Scheduled maintenance completed', message: 'Firmware update on rack B02 completed.', severity: 'info', status: 'resolved', serverId: null, ruleId: null, acknowledgedBy: null, minsAgo: 1440 }),
    mk(7, { title: 'Disk usage above 85%', message: 'ash-b03-01 /var at 87%.', severity: 'warning', status: 'dismissed', serverId: 'srv-b03-1', ruleId: 'rule-disk', acknowledgedBy: 'System', minsAgo: 2900 }),
    mk(8, { title: 'Latency above 5 ms', message: 'hio-d02-03 network latency 7.1 ms.', severity: 'warning', status: 'resolved', serverId: 'srv-d02-3', ruleId: 'rule-lat', acknowledgedBy: 'System', minsAgo: 4300 }),
  ];
}

export const defaultAlertRules: AlertRule[] = [
  { id: 'rule-cpu', name: 'High CPU', metric: 'cpu', operator: '>', threshold: 90, durationMin: 10, severity: 'critical', enabled: true, channels: ['email', 'slack'] },
  { id: 'rule-mem', name: 'High memory', metric: 'memory', operator: '>', threshold: 90, durationMin: 15, severity: 'warning', enabled: true, channels: ['email'] },
  { id: 'rule-temp', name: 'Overheating', metric: 'temperature', operator: '>', threshold: 80, durationMin: 5, severity: 'critical', enabled: true, channels: ['email', 'pagerduty'] },
  { id: 'rule-disk', name: 'Disk filling up', metric: 'storage', operator: '>', threshold: 85, durationMin: 30, severity: 'warning', enabled: true, channels: ['email'] },
  { id: 'rule-lat', name: 'Network latency', metric: 'latency', operator: '>', threshold: 5, durationMin: 5, severity: 'warning', enabled: false, channels: ['slack'] },
];

export const defaultNotificationSettings: NotificationSettings = {
  email: true, slack: false, webhook: false, pagerduty: false,
  slackChannel: '#noc-alerts', webhookUrl: '', quietHours: false, minSeverity: 'warning',
};

export const defaultMonitoring: MonitoringSettings = {
  scrapeIntervalSec: 15, retentionDays: 30, anomalySensitivity: 'medium', predictionHorizon: '24h', autoCreateIncidents: true,
};

/** Smooth, deterministic-looking time series for resource charts. */
export function resourceSeries(kind: 'cpu' | 'memory' | 'network' | 'storage', points: number, stepMs: number, seed = 1, now = Date.now()) {
  const rand = mulberry32(seed + kind.length * 31);
  const base = { cpu: 48, memory: 62, network: 41, storage: 66 }[kind];
  const amp = { cpu: 16, memory: 7, network: 22, storage: 2 }[kind];
  const out: { t: string; label: string; value: number }[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const ts = now - i * stepMs;
    const phase = (ts / stepMs) / 6;
    const drift = kind === 'storage' ? (points - i) * 0.05 : 0;
    const v = base + Math.sin(phase) * amp + (rand() - 0.5) * amp * 0.5 + drift;
    out.push({
      t: new Date(ts).toISOString(),
      label: stepMs >= DAY ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      value: Math.max(2, Math.min(99, Math.round(v * 10) / 10)),
    });
  }
  return out;
}

/** Sample log lines for an incident (browser-only demo mode; the backend has no log integration yet). */
export function sampleLogs(inc: Incident, server: Server | undefined) {
  const host = server?.hostname ?? 'unknown-host';
  const start = new Date(inc.createdAt).getTime();
  const t = (min: number) => new Date(start + min * 60_000).toISOString().replace('T', ' ').slice(0, 19);
  const byCat: Record<string, [string, string][]> = {
    thermal: [['WARN', `ipmi: temperature ${server?.temperature ?? 78}C exceeds warning threshold 75C`], ['WARN', 'kernel: CPU0: Core temperature above threshold, cpu clock throttled'], ['INFO', 'bmc: fan profile changed to performance']],
    software: [['WARN', 'jvm: heap usage 91% after full GC'], ['ERROR', 'jvm: GC pause 1.4s exceeds SLO'], ['INFO', 'deploy: consumer-client v3.4.1 rollout complete']],
    power: [['ERROR', 'bmc: PSU1 status: failure detected'], ['WARN', 'bmc: redundancy lost on power supply'], ['ERROR', 'healthcheck: 3 consecutive probe failures']],
    network: [['WARN', 'switch: Eth1/49 CRC errors 240/h'], ['ERROR', 'switch: Eth1/49 link flap detected']],
    hardware: [['WARN', 'bmc: Fan3 reading 0 RPM'], ['INFO', 'bmc: remaining fans compensating at 85%']],
    storage: [['WARN', 'smartd: reallocated sector count increased to 112'], ['ERROR', 'md0: write latency p99 41ms']],
    capacity: [['WARN', 'scheduler: vCPU allocation 85% of pool'], ['INFO', 'scheduler: 12 pending placements']],
  };
  return (byCat[inc.category] ?? []).map(([level, msg], i) => ({ at: t(i * 2 - 3), level, host, msg }));
}

const windowMs: Record<MetricSeries['window'], number> = { '1h': HOUR, '6h': 6 * HOUR, '24h': DAY, '7d': 7 * DAY };

/** Sample 5-minute series anchored to the sample servers' current readings (browser-only demo mode). */
export function sampleMetricSeries(server: Server | null, fleet: Server[], window: MetricSeries['window'], metrics: MetricKey[], now = Date.now()): MetricSeries {
  const step = window === '7d' ? HOUR : 5 * 60_000;
  const n = Math.round(windowMs[window] / step);
  const current = (m: MetricKey): number => {
    const pick = (s: Server) => ({ cpu: s.cpu, memory: s.memory, storage: s.storage, temperature: s.temperature, power: s.powerW, latency: s.networkLatencyMs, network: 180, disk_io: 25 }[m] ?? 0);
    const src = server ? [server] : fleet.filter((s) => s.connectivity !== 'offline');
    return src.length ? src.reduce((a, s) => a + (pick(s) ?? 0), 0) / src.length : 0;
  };
  const rand = mulberry32((server?.id ?? 'fleet').length * 97 + n);
  const points = Array.from({ length: n }, (_, i) => {
    const at = now - (n - 1 - i) * step;
    const p: MetricSeries['points'][number] = { at: new Date(at).toISOString() };
    metrics.forEach((m) => {
      const target = current(m);
      const wave = Math.sin(at / (6 * HOUR)) * target * 0.08;
      p[m] = Math.round(Math.max(0, target + wave - Math.sin(now / (6 * HOUR)) * target * 0.08 + (rand() - 0.5) * target * 0.04) * 10) / 10;
    });
    return p;
  });
  return { window, bucketSeconds: step / 1000, from: new Date(now - windowMs[window]).toISOString(), to: new Date(now).toISOString(), metrics, servers: server ? 1 : fleet.length, points, sample: true };
}
