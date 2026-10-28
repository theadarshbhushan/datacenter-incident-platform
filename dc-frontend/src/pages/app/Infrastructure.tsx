import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Cpu, Gauge, MemoryStick, Search, Server as ServerIcon, Thermometer, Wifi, WifiOff, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Card, CardHeader, Dialog, EmptyState, HealthBadge, SampleBadge, Select, SeverityBadge, Tabs, healthTone } from '@/components/ui';
import { WorkspaceEmpty } from '@/components/app/WorkspaceEmpty';
import { useWorkspace } from '@/context/WorkspaceContext';
import type { HealthStatus, Rack } from '@/types/domain';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { reading, timeAgo } from '@/utils/format';
import { fleetAverages } from '@/utils/analytics';

type View = 'layout' | 'rack' | 'server';

const statusRing: Record<HealthStatus, string> = {
  healthy: 'border-healthy-line bg-white hover:border-brand',
  warning: 'border-warning-line bg-warning-bg/40 hover:border-warning',
  critical: 'border-critical-line bg-critical-bg/50 hover:border-critical',
  offline: 'border-line bg-canvas hover:border-line-strong',
};
const ledColor: Record<HealthStatus, string> = { healthy: 'bg-brand', warning: 'bg-warning', critical: 'bg-critical', offline: 'bg-ink-faint' };

function Meter({ label, value, max = 100, unit = '%', warn = 75, crit = 90, icon }: { label: string; value: number | null; max?: number; unit?: string; warn?: number; crit?: number; icon?: ReactNode }) {
  const v = value ?? 0;
  const ratio = Math.min(1, v / max);
  const color = value === null ? 'bg-line' : v >= crit ? 'bg-critical' : v >= warn ? 'bg-warning' : 'bg-brand';
  return (
    <div>
      <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-ink-muted">{icon}{label}</span><span className="font-medium text-ink" title={value === null ? 'Not reported by this server' : undefined}>{reading(value, unit, unit === ' ms' ? 1 : 0)}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-line"><div className={cn('h-1.5 rounded-full', color)} style={{ width: `${ratio * 100}%` }} /></div>
    </div>
  );
}

const maxOf = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x !== null); return v.length ? Math.max(...v) : null; };

export default function Infrastructure() {
  const { workspace } = useWorkspace();
  const ws = workspace!;
  const [params, setParams] = useSearchParams();
  const serverParam = params.get('server');
  const rackParam = params.get('rack');
  const paramServer = serverParam ? ws.servers.find((s) => s.id === serverParam) : undefined;
  const paramRack = rackParam ? ws.racks.find((r) => r.id === rackParam) : undefined;
  const dcId = params.get('dc') || paramServer?.dcId || paramRack?.dcId || ws.dataCenters[0]?.id || '';
  const view = (params.get('view') as View) || (rackParam ? 'rack' : 'layout');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const racks = ws.racks.filter((r) => r.dcId === dcId);
  const servers = ws.servers.filter((s) => s.dcId === dcId);
  const selectedRack = paramRack && paramRack.dcId === dcId ? paramRack : racks.find((r) => r.status === 'critical') ?? racks[0];
  const rows = useMemo(() => {
    const m = new Map<string, Rack[]>();
    racks.forEach((r) => m.set(r.row, [...(m.get(r.row) ?? []), r]));
    return [...m.entries()].sort();
  }, [racks]);

  if (ws.dataCenters.length === 0 || ws.servers.length === 0) {
    return (
      <div>
        <PageHeader title="Infrastructure View" description="Live monitoring of data center infrastructure" crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Infrastructure' }]} />
        <WorkspaceEmpty title={ws.dataCenters.length ? `${ws.dataCenters[0]!.name} has no servers reporting yet` : 'No infrastructure connected yet'} />
      </div>
    );
  }

  const rackServers = (rid: string) => ws.servers.filter((s) => s.rackId === rid).sort((a, b) => a.slot - b.slot);
  const serverIncidents = (sid: string) => ws.incidents.filter((i) => i.serverIds.includes(sid));
  const filteredServers = servers
    .filter((s) => !statusFilter || s.status === statusFilter)
    .filter((s) => !q || s.hostname.includes(q.toLowerCase()) || s.ip.includes(q) || s.role.toLowerCase().includes(q.toLowerCase()));

  const RackDetails = ({ rack }: { rack: Rack }) => {
    const rs = rackServers(rack.id);
    const online = rs.filter((s) => s.connectivity !== 'offline').length;
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold text-ink">Rack-{rack.label} Details</p>
          <HealthBadge status={rack.status} />
        </div>
        <dl className="mt-4 divide-y divide-line text-sm">
          {[
            ['Inlet temperature', rack.inletTemp === null ? 'Not measured' : `${rack.inletTemp}°C`],
            ['Max server temperature', reading(maxOf(rs.map((s) => s.temperature)), '°C')],
            ['Power usage', `${rack.powerKw === null ? '—' : `${rack.powerKw} kW`} / ${rack.powerCapacityKw} kW`],
            ['Active servers', `${online} / ${rs.length}`],
            ['Open incidents', String(ws.incidents.filter((i) => i.rackId === rack.id && i.status !== 'resolved').length)],
          ].map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-ink-muted">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
        </dl>
        <button onClick={() => update({ view: 'rack', rack: rack.id, server: null })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2.5 text-sm font-medium text-brand hover:bg-brand-50">
          View Rack Details <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Infrastructure View"
        description="Live monitoring of data center infrastructure"
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Infrastructure' }]}
        actions={
          <>
            {ws.sample && <SampleBadge />}
            <Select aria-label="Data center" className="w-52" value={dcId} onChange={(e) => update({ dc: e.target.value, rack: null, server: null })}>
              {ws.dataCenters.map((d) => <option key={d.id} value={d.id}>{d.name}{d.location !== '—' ? ` - ${d.location}` : ''}</option>)}
            </Select>
          </>
        }
      />

      <Tabs
        className="mb-5"
        value={view}
        onChange={(v) => update({ view: v })}
        items={[{ id: 'layout', label: 'Data Center Layout' }, { id: 'rack', label: 'Rack View' }, { id: 'server', label: 'Server View', count: servers.length }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Racks', value: racks.length, icon: <Gauge className="h-4 w-4" /> },
          { label: 'Servers online', value: `${servers.filter((s) => s.connectivity !== 'offline').length}/${servers.length}`, icon: <Wifi className="h-4 w-4" /> },
          { label: 'Power draw', value: racks.some((r) => r.powerKw !== null) ? `${Math.round(racks.reduce((a, r) => a + (r.powerKw ?? 0), 0) * 10) / 10} kW` : '—', icon: <Zap className="h-4 w-4" /> },
          { label: 'Avg temperature', value: reading(fleetAverages(servers).temperature, '°C'), icon: <Thermometer className="h-4 w-4" /> },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand">{s.icon}</span>
            <div><p className="text-lg font-bold leading-tight text-ink">{s.value}</p><p className="text-xs text-ink-muted">{s.label}</p></div>
          </div>
        ))}
      </div>

      {view === 'layout' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Floor layout" description="Click a rack to inspect it. Colors show rack health." />
            <div className="space-y-5 p-5">
              {rows.map(([row, list]) => (
                <div key={row}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Row {row}</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {list.sort((a, b) => a.position - b.position).map((r) => {
                      const rs = rackServers(r.id);
                      return (
                        <button key={r.id} onClick={() => update({ rack: r.id })} aria-pressed={selectedRack?.id === r.id}
                          className={cn('rounded-xl border-2 p-3 text-left transition-colors', statusRing[r.status], selectedRack?.id === r.id && 'ring-2 ring-brand/40 ring-offset-1')}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-ink">Rack-{r.label}</span>
                            <span className={cn('h-2.5 w-2.5 rounded-full', ledColor[r.status])} aria-hidden />
                          </div>
                          <div className="mt-2 space-y-1" aria-hidden>
                            {rs.map((s) => (
                              <div key={s.id} className="flex h-3.5 items-center gap-1 rounded-sm bg-[#1E2A24] px-1">
                                {[0, 1, 2].map((k) => <span key={k} className={cn('h-1 w-1 rounded-full', s.status === 'offline' ? 'bg-ink-faint' : k === 0 ? ledColor[s.status] : 'bg-[#3D8B5F]')} />)}
                                <span className="ml-auto h-0.5 w-6 rounded bg-[#3A4A41]" />
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-[11px] text-ink-muted">{r.powerKw === null ? 'Power not reported' : `${r.powerKw} kW`} · {r.maxTemp == null ? 'no temp' : `max ${r.maxTemp}°C`}</p>
                          <p className={cn('text-[11px] font-medium', r.status === 'healthy' ? 'text-brand-700' : r.status === 'warning' ? 'text-warning' : 'text-critical')}>
                            {r.status === 'healthy' ? 'Normal' : r.status === 'warning' ? 'Needs attention' : 'Critical'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="h-fit p-5">{selectedRack ? <RackDetails rack={selectedRack} /> : <EmptyState title="Select a rack" />}</Card>
        </div>
      )}

      {view === 'rack' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title={selectedRack ? `Rack-${selectedRack.label}` : 'Rack'}
              description="Servers by slot. Click a server for details."
              action={<Select aria-label="Rack" className="h-8 w-32 text-xs" value={selectedRack?.id ?? ''} onChange={(e) => update({ rack: e.target.value })}>{racks.map((r) => <option key={r.id} value={r.id}>Rack {r.label}</option>)}</Select>}
            />
            <div className="space-y-2 p-5">
              {selectedRack && rackServers(selectedRack.id).map((s) => (
                <button key={s.id} onClick={() => update({ server: s.id })} className={cn('flex w-full flex-col gap-3 rounded-xl border p-3 text-left sm:flex-row sm:items-center', statusRing[s.status])}>
                  <span className="flex items-center gap-3 sm:w-56">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas font-mono text-xs text-ink-muted">U{s.slot}</span>
                    <span>
                      <span className="block font-mono text-sm text-ink">{s.hostname}</span>
                      <span className="block text-xs text-ink-muted">{s.role}</span>
                    </span>
                  </span>
                  <span className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                    <Meter label="CPU" value={s.cpu} />
                    <Meter label="Memory" value={s.memory} />
                    <Meter label="Temp" value={s.temperature} unit="°C" max={100} warn={70} crit={80} />
                    <Meter label="Power" value={s.powerW} unit=" W" max={900} warn={700} crit={820} />
                  </span>
                  <HealthBadge status={s.status} />
                </button>
              ))}
            </div>
          </Card>
          <Card className="h-fit p-5">{selectedRack && <RackDetails rack={selectedRack} />}</Card>
        </div>
      )}

      {view === 'server' && (
        <Card>
          <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input className="field h-10 pl-9" placeholder="Search hostname, IP or role" aria-label="Search servers" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select aria-label="Health status" className="sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option><option value="healthy">Healthy</option><option value="warning">Warning</option><option value="critical">Critical</option><option value="offline">Offline</option>
            </Select>
          </div>
          {filteredServers.length === 0 ? <EmptyState icon={<ServerIcon className="h-5 w-5" />} title="No servers match" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead><tr className="border-b border-line bg-canvas/60">{['Hostname', 'Rack', 'Role', 'CPU', 'Memory', 'Temp', 'Power', 'Connectivity', 'Health'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>
                  {filteredServers.map((s) => (
                    <tr key={s.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas/60" onClick={() => update({ server: s.id })}>
                      <td className="td"><button className="font-mono text-xs hover:text-brand" onClick={(e) => { e.stopPropagation(); update({ server: s.id }); }}>{s.hostname}</button><span className="block text-[11px] text-ink-muted">{s.ip}</span></td>
                      <td className="td">{ws.racks.find((r) => r.id === s.rackId)?.label}</td>
                      <td className="td text-ink-muted">{s.role}</td>
                      <td className={cn('td', (s.cpu ?? 0) >= 90 && 'font-semibold text-critical')}>{reading(s.cpu, '%')}</td>
                      <td className={cn('td', (s.memory ?? 0) >= 90 && 'font-semibold text-critical')}>{reading(s.memory, '%')}</td>
                      <td className={cn('td', (s.temperature ?? 0) >= 80 && 'font-semibold text-critical')}>{reading(s.temperature, '°C')}</td>
                      <td className="td">{reading(s.powerW, ' W')}</td>
                      <td className="td">{s.connectivity === 'offline' ? <span className="flex items-center gap-1 text-ink-muted"><WifiOff className="h-3.5 w-3.5" />Offline</span> : <span className={cn('flex items-center gap-1', s.connectivity === 'degraded' ? 'text-warning' : 'text-brand-700')}><Wifi className="h-3.5 w-3.5" />{s.connectivity === 'degraded' ? 'Degraded' : s.networkLatencyMs === null ? 'Online' : `${s.networkLatencyMs} ms`}</span>}</td>
                      <td className="td"><HealthBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Dialog open={!!serverParam} onClose={() => update({ server: null })} size="lg" title={paramServer ? paramServer.hostname : 'Server not found'} description={paramServer ? `${paramServer.role} · ${paramServer.model} · ${paramServer.ip}` : undefined}>
        {paramServer ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <HealthBadge status={paramServer.status} />
              <Badge tone={healthTone[paramServer.status]}>Rack {ws.racks.find((r) => r.id === paramServer.rackId)?.label} · U{paramServer.slot}</Badge>
              <Badge>{paramServer.source === 'agent' ? `Reporting for ${paramServer.uptimeDays} days` : `Uptime ${paramServer.uptimeDays} days`}</Badge>
              {paramServer.lastSeenAt && <Badge tone="neutral">Last reading {timeAgo(paramServer.lastSeenAt)}</Badge>}
              {(paramServer.sample ?? ws.sample) && <SampleBadge />}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Meter label="CPU" value={paramServer.cpu} icon={<Cpu className="h-3.5 w-3.5" />} />
              <Meter label="Memory" value={paramServer.memory} icon={<MemoryStick className="h-3.5 w-3.5" />} />
              <Meter label="Storage" value={paramServer.storage} icon={<ServerIcon className="h-3.5 w-3.5" />} warn={80} crit={90} />
              <Meter label="Temperature" value={paramServer.temperature} unit="°C" icon={<Thermometer className="h-3.5 w-3.5" />} warn={70} crit={80} />
              <Meter label="Power" value={paramServer.powerW} unit=" W" max={900} warn={700} crit={820} icon={<Zap className="h-3.5 w-3.5" />} />
              <Meter label="Network latency" value={paramServer.networkLatencyMs} unit=" ms" max={10} warn={3} crit={5} icon={<Wifi className="h-3.5 w-3.5" />} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Incidents</p>
              {serverIncidents(paramServer.id).length === 0 ? <p className="text-sm text-ink-muted">No incidents for this server.</p> : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {serverIncidents(paramServer.id).slice(0, 5).map((i) => (
                    <li key={i.id}><Link to={`/app/incidents/${i.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-canvas"><span className="font-mono text-xs text-ink-muted">{i.id}</span><span className="min-w-0 flex-1 truncate text-ink">{i.title}</span><SeverityBadge severity={i.severity} /><span className="hidden text-xs text-ink-muted sm:inline">{timeAgo(i.createdAt)}</span></Link></li>
                  ))}
                </ul>
              )}
            </div>
            {(() => {
              const p = ws.predictions.find((x) => x.serverId === paramServer.id && x.kind === 'anomaly');
              return p ? (
                <Link to={`/app/predictions/${p.id}`} className="flex items-center justify-between rounded-xl border border-line p-3 hover:border-line-strong">
                  <span className="text-sm"><span className="text-ink-muted">Model assessment: </span><span className="font-medium text-ink">{p.severity === 'normal' ? 'Normal' : `${p.type} (${p.severity})`}</span></span>
                  <span className="text-sm font-bold text-ink">{p.anomalyScore === null ? '—' : p.anomalyScore.toFixed(2)} <span className="text-xs font-normal text-ink-muted">anomaly score · {p.confidence} confidence</span></span>
                </Link>
              ) : <p className="text-sm text-ink-muted">{paramServer.assessment === 'insufficient_data' ? 'Not enough history yet: the model needs at least 4 hours of readings.' : 'No model assessment yet.'}</p>;
            })()}
          </div>
        ) : (
          <EmptyState title="This server isn't in the current organization" />
        )}
      </Dialog>
    </div>
  );
}
