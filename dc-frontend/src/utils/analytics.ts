import type { Incident, IncidentCategory, ReportSummary, Server, Severity, Workspace } from '@/types/domain';
import type { TrendPoint } from '@/components/charts/Charts';

const DAY = 86_400_000;

export const categoryLabels: Record<IncidentCategory, string> = {
  thermal: 'Thermal', power: 'Power', network: 'Network', hardware: 'Hardware', storage: 'Storage', software: 'Software', capacity: 'Capacity',
};

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function inRange(iso: string, from: number, to: number) {
  const t = new Date(iso).getTime();
  return t >= from && t <= to;
}

export function activeIncidents(incidents: Incident[]) {
  return incidents.filter((i) => i.status !== 'resolved');
}

export function countBySeverity(incidents: Incident[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, major: 0, minor: 0 };
  incidents.forEach((i) => { out[i.severity]++; });
  return out;
}

export function dailyTrend(incidents: Incident[], from: number, to: number): TrendPoint[] {
  const days: TrendPoint[] = [];
  const spanDays = Math.max(1, Math.round((startOfDay(to) - startOfDay(from)) / DAY) + 1);
  const step = spanDays > 31 ? 7 : 1;
  for (let d = startOfDay(from); d <= to; d += step * DAY) {
    const end = d + step * DAY;
    const bucket = incidents.filter((i) => { const t = new Date(i.createdAt).getTime(); return t >= d && t < end; });
    const c = countBySeverity(bucket);
    days.push({ label: new Date(d).toLocaleDateString('en-US', step === 1 && spanDays <= 7 ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }), ...c });
  }
  return days;
}

/** Hours an incident has been (or was) open, clipped to [from, to]. */
function openHours(i: Incident, from: number, to: number) {
  const start = Math.max(new Date(i.createdAt).getTime(), from);
  const end = Math.min(i.resolvedAt ? new Date(i.resolvedAt).getTime() : Date.now(), to);
  return Math.max(0, end - start) / 3_600_000;
}

/**
 * Estimated availability: server-hours lost to incidents divided by server-hours in the period.
 * Critical incidents count as full outage of the affected servers, major as 25% degradation.
 */
export function estimatedUptime(incidents: Incident[], serverCount: number, from: number, to: number): number {
  if (serverCount === 0) return 1;
  const total = ((to - from) / 3_600_000) * serverCount;
  const lost = incidents.reduce((acc, i) => {
    const w = i.severity === 'critical' ? 1 : i.severity === 'major' ? 0.25 : 0;
    return acc + openHours(i, from, to) * w * Math.max(1, i.serverIds.length);
  }, 0);
  return Math.max(0, 1 - lost / total);
}

export function downtimeMinutes(incidents: Incident[], from: number, to: number) {
  return Math.round(incidents.filter((i) => i.severity === 'critical').reduce((a, i) => a + openHours(i, from, to), 0) * 60);
}

export function mttrMinutes(incidents: Incident[]): number | null {
  const resolved = incidents.filter((i) => i.resolvedAt);
  if (!resolved.length) return null;
  const sum = resolved.reduce((a, i) => a + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()), 0);
  return Math.round(sum / resolved.length / 60_000);
}

export function uptimeSeries(incidents: Incident[], serverCount: number, from: number, to: number) {
  const out: { label: string; value: number }[] = [];
  for (let d = startOfDay(from); d <= to; d += DAY) {
    const end = Math.min(d + DAY, Date.now());
    out.push({
      label: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Math.round(estimatedUptime(incidents, serverCount, d, end) * 10000) / 100,
    });
  }
  return out;
}

export function categoryDistribution(incidents: Incident[]) {
  const map = new Map<IncidentCategory, number>();
  incidents.forEach((i) => map.set(i.category, (map.get(i.category) ?? 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: categoryLabels[k], value: v, key: k }));
}

/** Averages over online servers that report the metric. null when none do (never a made-up 0). */
export function fleetAverages(servers: Server[]) {
  const online = servers.filter((s) => s.connectivity !== 'offline');
  const avg = (f: (s: Server) => number | null) => {
    const vals = online.map(f).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : null;
  };
  const power = servers.map((s) => s.powerW).filter((v): v is number => v !== null && v !== undefined);
  return { cpu: avg((s) => s.cpu), memory: avg((s) => s.memory), storage: avg((s) => s.storage), temperature: avg((s) => s.temperature), powerKw: power.length ? Math.round(power.reduce((a, v) => a + v, 0) / 100) / 10 : null };
}

export const rangePresets = [
  { id: '24h', label: 'Last 24 hours', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
] as const;
export type RangeId = (typeof rangePresets)[number]['id'];

export function rangeBounds(id: RangeId) {
  const days = rangePresets.find((r) => r.id === id)!.days;
  const to = Date.now();
  return { from: id === '24h' ? to - DAY : startOfDay(to - (days - 1) * DAY), to };
}

export function formatRange(from: number, to: number) {
  const f = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${f(from)} – ${f(to)}`;
}

function countBy<T>(items: T[], key: (t: T) => string) {
  const out: Record<string, number> = {};
  items.forEach((i) => { const k = key(i); out[k] = (out[k] ?? 0) + 1; });
  return out;
}

/** Browser-only demo: the same summary GET /reports/summary computes on the server. */
export function mockReportSummary(ws: Omit<Workspace, "members" | "invitations">, from: number, to: number): ReportSummary {
  const created = ws.incidents.filter((i) => inRange(i.createdAt, from, to));
  const overlapping = ws.incidents.filter((i) => new Date(i.createdAt).getTime() <= to && (!i.resolvedAt || new Date(i.resolvedAt).getTime() >= from));
  const acked = created.filter((i) => i.acknowledgedAt);
  const daily = [];
  for (let d = startOfDay(from); d <= to; d += DAY) {
    const c = countBySeverity(created.filter((i) => { const t = new Date(i.createdAt).getTime(); return t >= d && t < d + DAY; }));
    daily.push({ date: new Date(d).toISOString().slice(0, 10), ...c, uptime: Math.round(estimatedUptime(overlapping, ws.servers.length, d, Math.min(d + DAY, Date.now())) * 10000) / 100 });
  }
  return {
    from: new Date(from).toISOString(), to: new Date(to).toISOString(), generatedAt: new Date().toISOString(), sample: ws.sample,
    incidents: {
      created: created.length, resolved: created.filter((i) => i.resolvedAt).length, activeNow: overlapping.filter((i) => i.status !== 'resolved').length,
      bySeverity: countBySeverity(created), byCategory: countBy(created, (i) => i.category), byStatus: countBy(created, (i) => i.status),
      bySource: countBy(created, (i) => i.source), mttrMinutes: mttrMinutes(created),
      mttaMinutes: acked.length ? Math.round(acked.reduce((a, i) => a + (new Date(i.acknowledgedAt!).getTime() - new Date(i.createdAt).getTime()), 0) / acked.length / 60_000) : null,
      downtimeMinutes: downtimeMinutes(overlapping, from, to),
    },
    uptime: { estimated: estimatedUptime(overlapping, ws.servers.length, from, to), servers: ws.servers.length, definition: 'Server-hours lost to incidents divided by server-hours in the period. Critical incidents count as full outage of their servers, major as 25% degradation, minor as none. This is an estimate from incident records, not a measured availability.' },
    daily,
    alerts: { created: ws.alerts.filter((a) => inRange(a.createdAt, from, to)).length, bySeverity: countBy(ws.alerts.filter((a) => inRange(a.createdAt, from, to)), (a) => a.severity), byStatus: countBy(ws.alerts, (a) => a.status) },
    servers: { total: ws.servers.length, byStatus: countBy(ws.servers, (s) => s.status) },
    predictions: { current: ws.predictions.length, anomaliesBySeverity: countBy(ws.predictions.filter((p) => p.kind === 'anomaly'), (p) => p.severity), earlyWarningsFlagged: ws.predictions.filter((p) => p.kind === 'early_warning' && p.severity !== 'normal').length },
  };
}
