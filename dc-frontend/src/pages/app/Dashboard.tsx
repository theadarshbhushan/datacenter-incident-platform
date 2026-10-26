import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, Clock4, Server, ShieldCheck, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader, EmptyState, HealthBadge, SampleBadge, Segmented, SeverityBadge, StatPill, StatusBadge } from '@/components/ui';
import { AreaMetricChart, IncidentTrendChart, Legend, chartColors } from '@/components/charts/Charts';
import { StatCard } from '@/components/app/StatCard';
import { RangeSelect } from '@/components/app/RangeSelect';
import { LivePill } from '@/components/app/LivePill';
import { WorkspaceEmpty } from '@/components/app/WorkspaceEmpty';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { resourceSeries } from '@/data/demo';
import { activeIncidents, countBySeverity, dailyTrend, estimatedUptime, fleetAverages, rangeBounds, type RangeId } from '@/utils/analytics';
import { timeAgo } from '@/utils/format';
import type { Workspace } from '@/types/domain';

type Metric = 'cpu' | 'memory' | 'network' | 'storage';
const metricLabels: Record<Metric, string> = { cpu: 'CPU', memory: 'Memory', network: 'Network', storage: 'Storage' };

function useResourceSeries(ws: Workspace, metric: Metric) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    const avg = fleetAverages(ws.servers);
    const series = resourceSeries(metric, 25, 3_600_000, 11 + tick, Date.now());
    // Anchor the sample curve to the fleet's current average so the chart and cards agree.
    const target = metric === 'network' ? 45 : avg[metric];
    const last = series[series.length - 1]!.value;
    return series.map((p) => ({ label: p.label, value: Math.max(1, Math.min(100, Math.round((p.value + (target - last)) * 10) / 10)) }));
  }, [ws.servers, metric, tick]);
}

export default function Dashboard() {
  const { workspace } = useWorkspace();
  const { session } = useAuth();
  const [range, setRange] = useState<RangeId>('7d');
  const [metric, setMetric] = useState<Metric>('cpu');
  const ws = workspace!;
  const { from, to } = rangeBounds(range);
  const series = useResourceSeries(ws, metric);

  const stats = useMemo(() => {
    const active = activeIncidents(ws.incidents);
    const sev = countBySeverity(active);
    const healthy = ws.servers.filter((s) => s.status === 'healthy').length;
    const warning = ws.servers.filter((s) => s.status === 'warning').length;
    const critical = ws.servers.filter((s) => s.status === 'critical' || s.status === 'offline').length;
    const span = to - from;
    const uptime = estimatedUptime(ws.incidents, ws.servers.length, from, to);
    const prevUptime = estimatedUptime(ws.incidents, ws.servers.length, from - span, from);
    const highRisk = ws.predictions.filter((p) => p.probability >= 0.7 && (p.horizon === '6h' || p.horizon === '24h'));
    const inRange = ws.incidents.filter((i) => { const t = new Date(i.createdAt).getTime(); return t >= from && t <= to; });
    return { active, sev, healthy, warning, critical, uptime, delta: uptime - prevUptime, highRisk, trend: dailyTrend(inRange, from, to), inRange };
  }, [ws, from, to]);

  const hasInfra = ws.servers.length > 0;
  const recent = [...ws.incidents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Real-time overview of data center health, incidents and infrastructure${session?.organization ? ` for ${session.organization.name}` : ''}`}
        actions={<><RangeSelect value={range} onChange={setRange} />{hasInfra && <LivePill />}{ws.sample && <SampleBadge />}</>}
      />

      {!hasInfra && <div className="mb-6"><WorkspaceEmpty /></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          to="/app/incidents?status=active"
          icon={<AlertTriangle className="h-5 w-5" />} iconTone="bg-critical-bg text-critical"
          value={stats.active.length} label="Active Incidents"
          footer={<><StatPill tone="critical">{stats.sev.critical} Critical</StatPill><StatPill tone="warning">{stats.sev.major} Major</StatPill><StatPill tone="healthy">{stats.sev.minor} Minor</StatPill></>}
        />
        <StatCard
          to="/app/infrastructure"
          icon={<Server className="h-5 w-5" />} iconTone="bg-brand-100 text-brand"
          value={ws.servers.length} label="Total Servers"
          footer={hasInfra ? <><StatPill tone="healthy">{stats.healthy} Healthy</StatPill><StatPill tone="warning">{stats.warning} Warning</StatPill>{stats.critical > 0 && <StatPill tone="critical">{stats.critical} Critical/offline</StatPill>}</> : <span className="text-ink-muted">No servers connected</span>}
        />
        <StatCard
          to="/app/reports"
          icon={<ShieldCheck className="h-5 w-5" />} iconTone="bg-brand-100 text-brand"
          value={hasInfra ? `${(stats.uptime * 100).toFixed(2)}%` : '—'} label="Uptime (estimated)"
          footer={hasInfra && (
            <span className={stats.delta >= 0 ? 'flex items-center gap-1 text-brand-700' : 'flex items-center gap-1 text-critical'}>
              {stats.delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {stats.delta >= 0 ? '+' : ''}{(stats.delta * 100).toFixed(2)}% vs previous period
            </span>
          )}
        />
        <StatCard
          to="/app/predictions"
          icon={<Zap className="h-5 w-5" />} iconTone="bg-orange-bg text-orange"
          value={stats.highRisk.length} label="Predicted Risk"
          footer={<StatPill tone={stats.highRisk.length ? 'critical' : 'healthy'}>{stats.highRisk.length ? 'High risk in next 24h' : 'No high-risk assets in next 24h'}</StatPill>}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Incident Trend (${range === '24h' ? 'last 24 hours' : `last ${range.replace('d', ' days')}`})`} action={<RangeSelect value={range} onChange={setRange} label="Trend range" />} />
          <div className="px-5 pb-5">
            <Legend className="mb-2 mt-1" items={[{ label: 'Critical', color: chartColors.critical }, { label: 'Major', color: chartColors.major }, { label: 'Minor', color: chartColors.minor }]} />
            {stats.inRange.length ? <IncidentTrendChart data={stats.trend} height={230} /> : <EmptyState title="No incidents in this period" description="Incidents created in the selected range will appear here." className="py-14" />}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Server Resource Usage"
            description={hasInfra ? `Fleet average, last 24 hours${ws.sample ? ' · sample telemetry' : ''}` : undefined}
            action={<Segmented value={metric} onChange={setMetric} items={(Object.keys(metricLabels) as Metric[]).map((m) => ({ id: m, label: metricLabels[m] }))} />}
          />
          <div className="px-5 pb-5 pt-3">
            {hasInfra ? <AreaMetricChart data={series} height={250} name={metricLabels[metric]} /> : <EmptyState title="No telemetry yet" description="Connect infrastructure to see resource usage." className="py-14" />}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent Incidents" action={<Link to="/app/incidents" className="text-sm font-medium text-brand hover:underline">View all</Link>} />
          <div className="mt-3 overflow-x-auto">
            {recent.length === 0 ? (
              <EmptyState icon={<Clock4 className="h-5 w-5" />} title="No incidents yet" description="When incidents are detected or created they show up here." />
            ) : (
              <table className="w-full min-w-[640px]">
                <thead><tr className="border-y border-line bg-canvas/60"><th className="th">ID</th><th className="th">Title</th><th className="th">Severity</th><th className="th">Status</th><th className="th">Detected</th></tr></thead>
                <tbody>
                  {recent.map((i) => (
                    <tr key={i.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                      <td className="td font-mono text-xs text-ink-muted"><Link to={`/app/incidents/${i.id}`} className="hover:text-brand">{i.id}</Link></td>
                      <td className="td max-w-[280px] truncate"><Link to={`/app/incidents/${i.id}`} className="font-medium hover:text-brand">{i.title}</Link></td>
                      <td className="td"><SeverityBadge severity={i.severity} /></td>
                      <td className="td"><StatusBadge status={i.status} /></td>
                      <td className="td text-ink-muted">{timeAgo(i.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Infrastructure Health" action={<Link to="/app/infrastructure" className="text-sm font-medium text-brand hover:underline">Open</Link>} />
          <div className="space-y-4 p-5">
            {ws.dataCenters.length === 0 && <p className="text-sm text-ink-muted">No data centers configured.</p>}
            {ws.dataCenters.map((dc) => {
              const racks = ws.racks.filter((r) => r.dcId === dc.id);
              const servers = ws.servers.filter((s) => s.dcId === dc.id);
              const bad = servers.filter((s) => s.status !== 'healthy').length;
              return (
                <Link key={dc.id} to={`/app/infrastructure?dc=${dc.id}`} className="block rounded-xl border border-line p-3.5 hover:border-line-strong">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{dc.name}{dc.location !== '—' && ` · ${dc.location}`}</p>
                      <p className="text-xs text-ink-muted">{racks.length} racks · {servers.length} servers · {dc.environment}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-ink-faint" />
                  </div>
                  {racks.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {racks.map((r) => (
                        <span key={r.id} title={`Rack ${r.label}: ${r.status}`} className={`flex h-7 min-w-10 items-center justify-center rounded-md px-1.5 text-[11px] font-medium ${r.status === 'healthy' ? 'bg-healthy-bg text-brand-700' : r.status === 'warning' ? 'bg-warning-bg text-warning' : 'bg-critical-bg text-critical'}`}>{r.label}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2.5">{servers.length ? (bad ? <HealthBadge status={servers.some((s) => s.status === 'critical') ? 'critical' : 'warning'} /> : <HealthBadge status="healthy" />) : null}{bad > 0 && <span className="ml-2 text-xs text-ink-muted">{bad} need attention</span>}</div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
