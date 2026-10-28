import { useEffect, useMemo, useState } from 'react';
import { Clock, Download, FileSpreadsheet, Timer, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Callout, Card, CardHeader, EmptyState, PageLoader, SampleBadge, Tabs } from '@/components/ui';
import { DonutChart, IncidentTrendChart, Legend, LineMetricChart, SimpleBarChart, chartColors } from '@/components/charts/Charts';
import { StatCard } from '@/components/app/StatCard';
import { RangeSelect } from '@/components/app/RangeSelect';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { categoryLabels, formatRange, rangeBounds, type RangeId } from '@/utils/analytics';
import { api, errorMessage } from '@/services/api';
import type { IncidentCategory, ReportSummary } from '@/types/domain';
import { downloadCsv } from '@/utils/csv';
import { durationLabel } from '@/utils/format';

type Tab = 'trends' | 'uptime' | 'resources' | 'export';

export default function Reports() {
  const { workspace, memberName } = useWorkspace();
  const { can } = useAuth();
  const toast = useToast();
  const ws = workspace!;
  const [tab, setTab] = useState<Tab>('trends');
  const [range, setRange] = useState<RangeId>('30d');
  const { from, to } = useMemo(() => rangeBounds(range), [range]); // eslint-disable-line react-hooks/exhaustive-deps
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // KPIs and charts come from GET /reports/summary, computed from the stored records on the server.
  useEffect(() => {
    let live = true;
    setError(null);
    api.getReportSummary(from, to).then((s) => { if (live) setSummary(s); }).catch((e) => { if (live) setError(errorMessage(e, 'Could not load the report.')); });
    return () => { live = false; };
  }, [from, to, ws.incidents]);

  const data = useMemo(() => {
    const inRange = ws.incidents.filter((i) => { const t = new Date(i.createdAt).getTime(); return t >= from && t <= to; });
    const s = summary;
    const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      inRange,
      sev: { critical: s?.incidents.bySeverity.critical ?? 0, major: s?.incidents.bySeverity.major ?? 0, minor: s?.incidents.bySeverity.minor ?? 0 },
      categories: Object.entries(s?.incidents.byCategory ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([k, v]) => ({ label: categoryLabels[k as IncidentCategory] ?? k, value: v ?? 0 })),
      trend: (s?.daily ?? []).map((d) => ({ label: dayLabel(d.date), critical: d.critical, major: d.major, minor: d.minor })),
      uptime: s?.uptime.estimated ?? 1,
      uptimeSeries: (s?.daily ?? []).slice(-30).map((d) => ({ label: dayLabel(d.date), value: d.uptime })),
      downtime: s?.incidents.downtimeMinutes ?? 0,
      mttr: s?.incidents.mttrMinutes ?? null,
      byRack: ws.racks.map((r) => {
        const srv = ws.servers.filter((x) => x.rackId === r.id && x.connectivity !== 'offline');
        const avg = (f: (x: typeof srv[number]) => number | null) => {
          const vals = srv.map(f).filter((v): v is number => v !== null);
          return vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : 0;
        };
        return { rack: r.label, cpu: avg((x) => x.cpu), memory: avg((x) => x.memory), storage: avg((x) => x.storage), powerKw: r.powerKw ?? 0 };
      }),
    };
  }, [ws, from, to, summary]);

  const total = summary?.incidents.created ?? 0;
  const share = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : '0%');

  const exports = [
    {
      id: 'incidents', title: 'Incident log', text: 'Every incident in the range with severity, status, timings and assignee.',
      run: () => downloadCsv(`vaultwatch-incidents-${range}.csv`, data.inRange.map((i) => ({
        id: i.id, title: i.title, severity: i.severity, status: i.status, category: i.category, source: i.source,
        detected_at: i.createdAt, resolved_at: i.resolvedAt ?? '', time_to_resolve_min: i.resolvedAt ? Math.round((new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime()) / 60000) : '',
        assignee: memberName(i.assigneeId),
      }))),
      count: data.inRange.length,
    },
    { id: 'uptime', title: 'Daily uptime', text: 'Estimated availability per day.', run: () => downloadCsv(`vaultwatch-uptime-${range}.csv`, data.uptimeSeries.map((d) => ({ day: d.label, uptime_pct: d.value }))), count: data.uptimeSeries.length },
    {
      id: 'servers', title: 'Server inventory and usage', text: 'Current readings for every server.',
      run: () => downloadCsv('vaultwatch-servers.csv', ws.servers.map((s) => ({ hostname: s.hostname, ip: s.ip, rack: ws.racks.find((r) => r.id === s.rackId)?.label ?? '', role: s.role, cpu_pct: s.cpu, memory_pct: s.memory, storage_pct: s.storage, temperature_c: s.temperature, power_w: s.powerW, status: s.status }))),
      count: ws.servers.length,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description="Detailed insights and reports"
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Reports' }]}
        actions={<>{ws.sample && <SampleBadge />}<span className="hidden text-sm text-ink-muted md:inline">{formatRange(from, to)}</span><RangeSelect value={range} onChange={setRange} /></>}
      />
      {error && <Callout tone="warning" className="mb-4" title="Report unavailable">{error} Nothing below is estimated without the server's data.</Callout>}
      {!summary && !error && <PageLoader label="Calculating report…" />}
      {summary && <p className="mb-3 text-xs text-ink-muted">Calculated by the server from {summary.incidents.created} incidents, {summary.alerts.created} alerts and {summary.servers.total} servers · {summary.uptime.definition}</p>}
      {summary && <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ id: 'trends', label: 'Incident Trends' }, { id: 'uptime', label: 'Uptime Analysis' }, { id: 'resources', label: 'Resource Usage' }, { id: 'export', label: 'Export Reports' }]} />}

      {summary && tab === 'trends' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="Incidents by Severity" />
            <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:justify-center xl:flex-col 2xl:flex-row">
              <DonutChart
                centerValue={total}
                centerLabel="Total incidents"
                data={[{ name: 'Critical', value: data.sev.critical, color: chartColors.critical }, { name: 'Major', value: data.sev.major, color: chartColors.major }, { name: 'Minor', value: data.sev.minor, color: chartColors.minor }]}
              />
              <Legend className="flex-col !items-start gap-2" items={[
                { label: 'Critical', color: chartColors.critical, value: `${data.sev.critical} (${share(data.sev.critical)})` },
                { label: 'Major', color: chartColors.major, value: `${data.sev.major} (${share(data.sev.major)})` },
                { label: 'Minor', color: chartColors.minor, value: `${data.sev.minor} (${share(data.sev.minor)})` },
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Incident Category Distribution" />
            <div className="p-5">{data.categories.length ? <SimpleBarChart data={data.categories} height={220} name="Incidents" /> : <EmptyState title="No incidents in range" />}</div>
          </Card>
          <Card>
            <CardHeader title="Estimated uptime" action={<span className="rounded-md bg-healthy-bg px-2 py-0.5 text-xs font-semibold text-brand-700">{ws.servers.length ? `${(data.uptime * 100).toFixed(2)}%` : '—'}</span>} />
            <div className="p-5">{ws.servers.length ? <LineMetricChart data={data.uptimeSeries} height={220} name="Uptime" domain={['auto', 100]} /> : <EmptyState title="No servers to measure" />}</div>
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader title="Incidents over time" action={<Legend items={[{ label: 'Critical', color: chartColors.critical }, { label: 'Major', color: chartColors.major }, { label: 'Minor', color: chartColors.minor }]} />} />
            <div className="p-5">{total ? <IncidentTrendChart data={data.trend} height={260} /> : <EmptyState title="No incidents in range" />}</div>
          </Card>
        </div>
      )}

      {summary && tab === 'uptime' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={<TrendingDown className="h-5 w-5" />} iconTone="bg-brand-100 text-brand" value={ws.servers.length ? `${(data.uptime * 100).toFixed(3)}%` : '—'} label="Estimated availability" />
            <StatCard icon={<Clock className="h-5 w-5" />} iconTone="bg-critical-bg text-critical" value={durationLabel(data.downtime * 60000)} label="Critical incident time" />
            <StatCard icon={<Timer className="h-5 w-5" />} iconTone="bg-violet-bg text-violet" value={data.mttr === null ? '—' : durationLabel(data.mttr * 60000)} label="Mean time to resolve (MTTR)" />
          </div>
          <Card>
            <CardHeader title="Daily availability" description="Server-hours lost to critical (full) and major (25%) incidents, divided by total server-hours." />
            <div className="p-5">{ws.servers.length ? <LineMetricChart data={data.uptimeSeries} height={300} name="Uptime" domain={['auto', 100]} /> : <EmptyState title="No servers to measure" />}</div>
          </Card>
        </div>
      )}

      {summary && tab === 'resources' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {(['cpu', 'memory', 'storage', 'powerKw'] as const).map((k) => (
            <Card key={k}>
              <CardHeader title={{ cpu: 'Average CPU by rack', memory: 'Average memory by rack', storage: 'Average storage by rack', powerKw: 'Power draw by rack' }[k]} description={ws.sample ? 'Current sample readings' : 'Current readings'} />
              <div className="p-5">{data.byRack.length ? <SimpleBarChart data={data.byRack.map((r) => ({ label: r.rack, value: r[k] }))} unit={k === 'powerKw' ? ' kW' : '%'} name={k === 'powerKw' ? 'Power' : 'Average'} height={220} color={k === 'powerKw' ? chartColors.major : chartColors.brand} /> : <EmptyState title="No racks yet" />}</div>
            </Card>
          ))}
        </div>
      )}

      {summary && tab === 'export' && (
        <div className="grid gap-4 md:grid-cols-3">
          {exports.map((e) => (
            <Card key={e.id} className="flex flex-col p-5">
              <FileSpreadsheet className="h-6 w-6 text-brand" />
              <p className="mt-3 font-semibold text-ink">{e.title}</p>
              <p className="mt-1 flex-1 text-sm text-ink-muted">{e.text}</p>
              <p className="mt-3 text-xs text-ink-faint">{e.count} rows · {formatRange(from, to)}</p>
              <Button
                className="mt-4"
                variant="secondary"
                icon={<Download className="h-4 w-4" />}
                disabled={!can('reports:export') || e.count === 0}
                onClick={() => { e.run(); toast.success('Export started', `${e.title} downloaded as CSV.`); }}
              >
                Export CSV
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
