import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Server, Zap } from 'lucide-react';
import { AreaMetricChart, IncidentTrendChart } from '@/components/charts/Charts';
import { buildIncidents, buildInfrastructure, resourceSeries } from '@/data/demo';
import { activeIncidents, dailyTrend } from '@/utils/analytics';
import { SampleBadge, SeverityBadge, StatusBadge } from '@/components/ui';
import { LogoMark } from '@/components/ui/Logo';

/** A faithful, non-interactive miniature of the real dashboard, rendered from sample data. */
export function DashboardPreview() {
  const data = useMemo(() => {
    const { servers } = buildInfrastructure();
    const incidents = buildIncidents(servers);
    const now = Date.now();
    return {
      servers,
      incidents,
      active: activeIncidents(incidents),
      trend: dailyTrend(incidents, now - 6 * 86_400_000, now),
      cpu: resourceSeries('cpu', 24, 3_600_000, 3),
    };
  }, []);
  const stats = [
    { icon: AlertTriangle, tone: 'bg-critical-bg text-critical', value: data.active.length, label: 'Active incidents' },
    { icon: Server, tone: 'bg-brand-100 text-brand', value: data.servers.length, label: 'Total servers' },
    { icon: CheckCircle2, tone: 'bg-brand-100 text-brand', value: '99.7%', label: 'Uptime' },
    { icon: Zap, tone: 'bg-orange-bg text-orange', value: 1, label: 'Predicted risk' },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lift" aria-label="Preview of the VaultWatch dashboard with sample data" role="img">
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" /><span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" /><span className="h-2.5 w-2.5 rounded-full bg-[#4ADE80]" />
        <span className="ml-3 hidden rounded-md bg-white px-3 py-0.5 text-[11px] text-ink-faint sm:inline">app.vaultwatch.example/app/dashboard</span>
        <SampleBadge className="ml-auto" />
      </div>
      <div className="flex">
        <div className="hidden w-40 shrink-0 border-r border-line bg-[#FBFCFB] p-3 md:block">
          <div className="mb-4 flex items-center gap-1.5 text-sm font-semibold"><LogoMark className="h-5 w-5" />VaultWatch</div>
          {['Dashboard', 'Incidents', 'Prediction', 'Infrastructure', 'Reports', 'Alerts', 'Settings'].map((n, i) => (
            <div key={n} className={`mb-0.5 rounded-md px-2 py-1.5 text-xs ${i === 0 ? 'bg-brand-100 font-medium text-brand-800' : 'text-ink-muted'}`}>{n}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <p className="text-base font-bold text-ink">Dashboard</p>
          <p className="text-[11px] text-ink-muted">Real-time overview of data center health, incidents and infrastructure</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map(({ icon: Icon, tone, value, label }) => (
              <div key={label} className="rounded-lg border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tone}`}><Icon className="h-4 w-4" /></span>
                  <span className="text-lg font-bold text-ink">{value}</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            <div className="rounded-lg border border-line p-2.5">
              <p className="text-xs font-semibold text-ink">Incident trend (last 7 days)</p>
              <IncidentTrendChart data={data.trend} height={130} />
            </div>
            <div className="rounded-lg border border-line p-2.5">
              <p className="text-xs font-semibold text-ink">Server resource usage · CPU</p>
              <AreaMetricChart data={data.cpu} height={130} name="CPU" />
            </div>
          </div>
          <div className="mt-3 hidden rounded-lg border border-line sm:block">
            {data.active.slice(0, 3).map((i) => (
              <div key={i.id} className="flex items-center gap-3 border-b border-line px-3 py-2 text-[11px] last:border-0">
                <span className="w-24 shrink-0 font-mono text-ink-muted">{i.id}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{i.title}</span>
                <SeverityBadge severity={i.severity} />
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
