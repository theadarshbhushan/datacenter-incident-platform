import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Bot, CheckCircle2, CircleDot, Cpu, FileText, MemoryStick, MessageSquare, MoreVertical, Network, Pencil,
  RotateCcw, Server as ServerIcon, Sparkles, UserCheck, Wrench,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/PageHeader';
import { Badge, Button, Card, CardHeader, EmptyState, HealthBadge, Input, Menu, SampleBadge, Select, SeverityBadge, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { LineMetricChart, chartColors } from '@/components/charts/Charts';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api, errorMessage } from '@/services/api';
import { seriesFor } from '@/hooks/useMetrics';
import { durationLabel, formatDateTime, timeAgo, pct, reading } from '@/utils/format';
import { categoryLabels } from '@/utils/analytics';
import type { IncidentContext, TimelineEvent } from '@/types/domain';
import { ResolveDialog, useIncidentActions } from './Incidents';
import NotFound from './NotFound';

type Tab = 'overview' | 'metrics' | 'logs' | 'ai' | 'history';

const eventIcon: Record<TimelineEvent['type'], ReactNode> = {
  created: <AlertTriangle className="h-3.5 w-3.5" />, assigned: <UserCheck className="h-3.5 w-3.5" />, status: <CircleDot className="h-3.5 w-3.5" />,
  comment: <MessageSquare className="h-3.5 w-3.5" />, ai: <Sparkles className="h-3.5 w-3.5" />, severity: <AlertTriangle className="h-3.5 w-3.5" />,
  resolved: <CheckCircle2 className="h-3.5 w-3.5" />, reopened: <RotateCcw className="h-3.5 w-3.5" />,
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-5 border-l border-line pl-6">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${e.type === 'resolved' ? 'bg-brand text-white' : e.type === 'ai' ? 'bg-violet-bg text-violet' : e.type === 'created' ? 'bg-critical-bg text-critical' : 'bg-canvas text-ink-muted'}`}>{eventIcon[e.type]}</span>
          <p className="text-sm text-ink">{e.message}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{e.actor} · {formatDateTime(e.at)}</p>
        </li>
      ))}
    </ol>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

export default function IncidentDetail() {
  const { incidentId } = useParams();
  const { workspace, memberName } = useWorkspace();
  const { can, session } = useAuth();
  const run = useIncidentActions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'overview');
  const [editingAssignee, setEditingAssignee] = useState(params.get('assign') === '1');
  const [dialog, setDialog] = useState<'resolve' | 'reopen' | null>(null);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [metricWindow, setMetricWindow] = useState<'1h' | '6h' | '24h'>('1h');
  const ws = workspace!;
  const inc = ws.incidents.find((i) => i.id === incidentId);
  useDocumentTitle(inc ? `${inc.id} · ${inc.title}` : 'Incident not found');
  useEffect(() => { if (params.get('assign')) { const p = new URLSearchParams(params); p.delete('assign'); setParams(p, { replace: true }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const servers = useMemo(() => (inc ? ws.servers.filter((s) => inc.serverIds.includes(s.id)) : []), [inc, ws.servers]);
  const primary = servers[0];
  const rack = inc ? ws.racks.find((r) => r.id === inc.rackId) : undefined;
  const dc = inc ? ws.dataCenters.find((d) => d.id === inc.dcId) : undefined;
  const endAt = inc?.resolvedAt ? new Date(inc.resolvedAt).getTime() : Date.now();
  const [ctx, setCtx] = useState<IncidentContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [cause, setCause] = useState('');
  useEffect(() => {
    if (!inc) return;
    let live = true;
    api.getIncidentContext(inc.id, metricWindow)
      .then((c) => { if (live) { setCtx(c); setCtxError(null); } })
      .catch((e) => { if (live) setCtxError(errorMessage(e, 'Could not load metrics for this incident.')); });
    return () => { live = false; };
  }, [inc?.id, inc?.updatedAt, metricWindow]); // eslint-disable-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => (ctx?.metrics ? { cpu: seriesFor(ctx.metrics, 'cpu'), mem: seriesFor(ctx.metrics, 'memory'), temp: seriesFor(ctx.metrics, 'temperature'), net: seriesFor(ctx.metrics, 'network') } : null), [ctx]);

  if (!inc) return <NotFound inApp title="Incident not found" message={`We couldn't find ${incidentId} in this organization. It may belong to another organization or have an incorrect ID.`} />;

  const canWrite = can('incident:write');
  const resolved = inc.status === 'resolved';
  const duration = durationLabel(endAt - new Date(inc.createdAt).getTime());
  const assignable = ws.members.filter((m) => m.role !== 'viewer');
  const logs = ctx?.logs.lines ?? [];
  const last = (d: { value: number | null }[]) => [...d].reverse().find((p) => p.value !== null)?.value ?? null;

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'metrics' as const, label: 'Metrics' },
    { id: 'logs' as const, label: 'Logs' },
    { id: 'ai' as const, label: 'AI Analysis' },
    { id: 'history' as const, label: 'Action History', count: inc.timeline.length },
  ];

  const MetricTile = ({ icon, label, unit, data, color, domain }: { icon: ReactNode; label: string; unit: string; data: { label: string; value: number | null }[]; color: string; domain?: [number | 'auto', number | 'auto'] }) => (
    <div className="rounded-xl border border-line p-3.5">
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">{icon}{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{reading(last(data), unit, unit === '%' ? 0 : 1)}</p>
      {data.some((p) => p.value !== null) ? <LineMetricChart data={data} height={120} color={color} name={label} unit={unit} domain={domain ?? [0, 100]} /> : <p className="py-10 text-center text-xs text-ink-muted">Not reported</p>}
    </div>
  );

  const metricsPanel = !primary ? (
    <EmptyState icon={<ServerIcon className="h-5 w-5" />} title="No server linked" description="This incident isn't linked to a monitored server, so there are no metrics to show." />
  ) : ctxError ? (
    <EmptyState title="Could not load metrics" description={ctxError} />
  ) : !metrics ? (
    <p className="py-10 text-center text-sm text-ink-muted">Loading metrics…</p>
  ) : !ctx?.metrics?.points.length ? (
    <EmptyState icon={<ServerIcon className="h-5 w-5" />} title="No telemetry in this window" description={`${primary.hostname} sent no readings in this period${inc.resolvedAt ? ' before the incident was resolved' : ''}.`} />
  ) : (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <MetricTile icon={<Cpu className="h-3.5 w-3.5" />} label="CPU Usage" unit="%" data={metrics.cpu} color={chartColors.critical} />
      <MetricTile icon={<MemoryStick className="h-3.5 w-3.5" />} label="Memory Usage" unit="%" data={metrics.mem} color={chartColors.brand} />
      <MetricTile icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Temperature" unit="°C" data={metrics.temp} color={chartColors.major} domain={[0, 'auto']} />
      <MetricTile icon={<Network className="h-3.5 w-3.5" />} label="Network (Mb/s)" unit=" Mb/s" data={metrics.net} color={chartColors.brand} domain={[0, 'auto']} />
    </div>
  );
  const status = inc.analysis.rootCauseStatus ?? (inc.analysis.generatedBy === 'sample' ? 'suspected' : 'unknown');

  const aiPanel = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="violet"><Bot className="h-3 w-3" /> Root-cause assistance</Badge>
        {inc.analysis.generatedBy === 'sample' ? <SampleBadge label="Sample analysis" /> : <Badge tone="neutral">Rule-based, from telemetry and history</Badge>}
        <Badge tone={status === 'confirmed' ? 'healthy' : status === 'suspected' ? 'warning' : 'neutral'}>{status === 'confirmed' ? 'Confirmed cause' : status === 'suspected' ? 'Suspected cause' : 'No cause suggested'}</Badge>
      </div>
      <p className="text-sm leading-6 text-ink">{inc.analysis.summary}</p>
      <div className="rounded-xl border border-violet-line bg-violet-bg/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet">{status === 'confirmed' ? 'Confirmed root cause' : 'Suspected root cause'}</p>
        <p className="mt-1 text-sm font-medium text-ink">{inc.analysis.rootCause}</p>
        <p className="mt-2 text-xs text-ink-muted">
          {status === 'confirmed'
            ? `Confirmed by ${inc.analysis.confirmedBy ?? 'a teammate'}${inc.analysis.confirmedAt ? ` ${timeAgo(inc.analysis.confirmedAt)}` : ''}.`
            : 'A suggestion from the evidence below, not a diagnosis. Verify it before acting, then confirm or correct it.'}
          {inc.analysis.evidenceStrength && inc.analysis.evidenceStrength !== 'none' && ` Evidence: ${inc.analysis.evidenceStrength}.`}
          {inc.analysis.generatedBy === 'sample' && inc.analysis.rootCauseConfidence !== undefined && ` Sample confidence value: ${pct(inc.analysis.rootCauseConfidence)} (illustrative).`}
        </p>
      </div>
      {!!inc.analysis.evidence?.length && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Evidence</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink">{inc.analysis.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {canWrite && status !== 'confirmed' && (
        <div className="rounded-xl border border-line p-4">
          <label htmlFor="cause" className="mb-1.5 block text-sm font-medium text-ink">Confirm the root cause</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="cause" value={cause} maxLength={500} placeholder={status === 'suspected' ? inc.analysis.rootCause : 'What actually caused it?'} onChange={(e) => setCause(e.target.value)} />
            <Button size="sm" disabled={(cause.trim() || (status === 'suspected' ? inc.analysis.rootCause : '')).length < 3}
              onClick={async () => { if (await run(inc, { type: 'confirm_root_cause', rootCause: cause.trim() || inc.analysis.rootCause }, 'Root cause confirmed')) setCause(''); }}>Confirm</Button>
            {inc.analysis.generatedBy !== 'sample' && <Button size="sm" variant="secondary" onClick={() => void run(inc, { type: 'refresh_analysis' }, 'Analysis refreshed')}>Refresh from telemetry</Button>}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Contributing factors</p>
        <ul className="space-y-2">
          {inc.analysis.contributingFactors.map((f) => (
            <li key={f.label} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-ink-muted">{f.label}</span>
              <span className="h-2 flex-1 rounded-full bg-line"><span className="block h-2 rounded-full bg-violet" style={{ width: `${f.weight * 100}%` }} /></span>
              <span className="w-24 text-right font-medium text-ink" title="Anomaly score of this metric (percentile, not a probability)">{f.value ?? pct(f.weight)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><Wrench className="h-4 w-4 text-brand" /> Remediation suggestions</p>
        <ol className="space-y-2">
          {inc.analysis.remediation.map((r, i) => (
            <li key={r} className="flex gap-3 rounded-lg bg-canvas px-3 py-2.5 text-sm text-ink"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">{i + 1}</span>{r}</li>
          ))}
        </ol>
      </div>
    </div>
  );

  const postComment = async () => {
    if (comment.trim().length < 2) return;
    setPosting(true);
    if (await run(inc, { type: 'comment', message: comment.trim() }, 'Comment added')) setComment('');
    setPosting(false);
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Incidents', to: '/app/incidents' }, { label: inc.id }]} />
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app/incidents'))} className="mt-1 rounded-md p-1 text-critical hover:bg-critical-bg" aria-label="Back to incidents"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">{inc.title}</h1>
              <SeverityBadge severity={inc.severity} />
            </div>
            <p className="mt-1 text-sm text-ink-muted"><span className="font-mono">{inc.id}</span> · Detected {timeAgo(inc.createdAt)} · Duration: {duration}{!resolved && ' (ongoing)'}</p>
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2 pl-9 lg:pl-0">
            {!inc.acknowledged && !resolved && <Button variant="secondary" onClick={() => void run(inc, { type: 'acknowledge' }, 'Incident acknowledged')}>Acknowledge</Button>}
            {resolved ? <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setDialog('reopen')}>Reopen Incident</Button> : <Button onClick={() => setDialog('resolve')}>Resolve Incident</Button>}
            <Menu
              label="More incident actions"
              trigger={<span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white"><MoreVertical className="h-4 w-4" /></span>}
              items={[
                { label: 'Assign to me', icon: <UserCheck className="h-4 w-4" />, hidden: inc.assigneeId === session?.user.id || resolved, onSelect: () => void run(inc, { type: 'assign', userId: session!.user.id }, 'Assigned to you') },
                { label: 'Change assignee', icon: <Pencil className="h-4 w-4" />, hidden: resolved, onSelect: () => { setTab('overview'); setEditingAssignee(true); } },
                { label: 'Add comment', icon: <MessageSquare className="h-4 w-4" />, onSelect: () => setTab('history') },
                { label: 'Mark investigating', icon: <CircleDot className="h-4 w-4" />, hidden: inc.status !== 'ongoing', onSelect: () => void run(inc, { type: 'status', status: 'investigating' }, 'Status updated') },
              ]}
            />
          </div>
        )}
      </div>

      <Tabs items={tabs} value={tab} onChange={(t) => { setTab(t); const p = new URLSearchParams(params); p.set('tab', t); setParams(p, { replace: true }); }} className="mb-5" />

      {tab === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-2">
            <CardHeader title="Incident Information" />
            <dl className="divide-y divide-line px-5 pb-4 pt-2">
              <InfoRow label="Severity"><SeverityBadge severity={inc.severity} /></InfoRow>
              <InfoRow label="Affected Server">{servers.length ? servers.map((s) => <Link key={s.id} to={`/app/infrastructure?server=${s.id}`} className="block font-mono text-xs hover:text-brand">{s.hostname}</Link>) : '—'}</InfoRow>
              <InfoRow label="Location">{rack ? `Rack ${rack.label}` : '—'}{dc ? ` · ${dc.name}` : ''}</InfoRow>
              <InfoRow label="Detected Time">{formatDateTime(inc.createdAt)}</InfoRow>
              <InfoRow label="Status"><StatusBadge status={inc.status} /></InfoRow>
              <InfoRow label="Category">{categoryLabels[inc.category]}</InfoRow>
              <InfoRow label="Source">{inc.source === 'ai' ? 'Anomaly detection' : inc.source === 'rule' ? 'Alert rule' : 'Manual'}</InfoRow>
              <InfoRow label="Assigned To">
                {editingAssignee && canWrite && !resolved ? (
                  <Select
                    aria-label="Assignee"
                    autoFocus
                    className="h-8 w-44 text-xs"
                    value={inc.assigneeId ?? ''}
                    onBlur={() => setEditingAssignee(false)}
                    onChange={async (e) => { setEditingAssignee(false); await run(inc, { type: 'assign', userId: e.target.value || null }, 'Assignee updated'); }}
                  >
                    <option value="">Unassigned</option>
                    {assignable.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                  </Select>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {memberName(inc.assigneeId)}
                    {canWrite && !resolved && <button onClick={() => setEditingAssignee(true)} className="rounded p-0.5 text-ink-faint hover:text-brand" aria-label="Change assignee"><Pencil className="h-3.5 w-3.5" /></button>}
                  </span>
                )}
              </InfoRow>
              {inc.resolvedAt && <InfoRow label="Resolved">{formatDateTime(inc.resolvedAt)}</InfoRow>}
            </dl>
            <div className="border-t border-line px-5 py-4"><p className="text-sm text-ink-muted">{inc.description}</p></div>
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader
              title="Live Metrics"
              description={primary ? `${primary.hostname}${ws.sample ? ' · sample telemetry' : ''}` : undefined}
              action={primary && <Select aria-label="Metrics window" className="h-8 w-32 text-xs" value={metricWindow} onChange={(e) => setMetricWindow(e.target.value as typeof metricWindow)}><option value="1h">Last 1 hour</option><option value="6h">Last 6 hours</option><option value="24h">Last 24 hours</option></Select>}
            />
            <div className="p-5">{metricsPanel}</div>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Affected Infrastructure" />
            <div className="space-y-2 p-5">
              {servers.length === 0 && <p className="text-sm text-ink-muted">{rack ? `Rack ${rack.label}, no specific servers linked.` : 'No infrastructure linked.'}</p>}
              {servers.map((s) => (
                <Link key={s.id} to={`/app/infrastructure?server=${s.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 hover:border-line-strong">
                  <span>
                    <span className="block font-mono text-sm text-ink">{s.hostname}</span>
                    <span className="block text-xs text-ink-muted">{s.role} · {s.ip} · CPU {reading(s.cpu, '%')} · {reading(s.temperature, '°C')}</span>
                  </span>
                  <HealthBadge status={s.status} />
                </Link>
              ))}
            </div>
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader title="AI Summary" action={<button onClick={() => setTab('ai')} className="text-sm font-medium text-brand hover:underline">Full analysis</button>} />
            <div className="p-5">
              <p className="text-sm text-ink">{inc.analysis.summary}</p>
              <p className="mt-3 text-sm"><span className="text-ink-muted">{status === 'confirmed' ? 'Confirmed root cause: ' : 'Suspected root cause: '}</span><span className="font-medium text-ink">{inc.analysis.rootCause}</span></p>
              {!!ctx?.alerts.length && <p className="mt-3 text-xs text-ink-muted">Correlated alerts: {ctx.alerts.slice(0, 3).map((a) => a.title).join('; ')}{ctx.alerts.length > 3 ? ` and ${ctx.alerts.length - 3} more` : ''}</p>}
              {inc.analysis.generatedBy === 'sample' && <SampleBadge label="Sample analysis" className="mt-3" />}
            </div>
          </Card>
          <Card className="xl:col-span-5">
            <CardHeader title="Incident Timeline" />
            <div className="p-5 pl-8"><Timeline events={inc.timeline} /></div>
          </Card>
        </div>
      )}

      {tab === 'metrics' && <Card><CardHeader title="Metrics" description={primary ? `Readings for ${primary.hostname} around the incident window` : undefined} action={primary && <Select aria-label="Metrics window" className="h-8 w-32 text-xs" value={metricWindow} onChange={(e) => setMetricWindow(e.target.value as typeof metricWindow)}><option value="1h">Last 1 hour</option><option value="6h">Last 6 hours</option><option value="24h">Last 24 hours</option></Select>} /><div className="p-5">{metricsPanel}</div></Card>}

      {tab === 'logs' && (
        <Card>
          <CardHeader title="Logs" description="Log lines correlated with this incident" action={logs.length > 0 && <SampleBadge label="Sample logs" />} />
          <div className="p-5">
            {logs.length ? (
              <pre className="overflow-x-auto rounded-xl bg-[#0F1A14] p-4 font-mono text-xs leading-6 text-[#D6E4DA]">
                {logs.map((l, i) => (
                  <div key={i}><span className="text-[#7E9486]">{l.at}</span> <span className={l.level === 'ERROR' ? 'text-[#F87171]' : l.level === 'WARN' ? 'text-[#FBBF24]' : 'text-[#86EFAC]'}>{l.level.padEnd(5)}</span> <span className="text-[#9FB5A7]">{l.host}</span> {l.msg}</div>
                ))}
              </pre>
            ) : (
              <EmptyState icon={<FileText className="h-5 w-5" />} title="No log source connected" description="Connect a log integration (for example Loki, Elasticsearch or syslog) to see correlated log lines here." action={can('integrations:manage') ? <Link to="/app/integrations" className="text-sm font-medium text-brand hover:underline">Open Integrations</Link> : undefined} />
            )}
          </div>
        </Card>
      )}

      {tab === 'ai' && <Card><CardHeader title="AI Analysis" /><div className="p-5">{aiPanel}</div></Card>}

      {tab === 'history' && (
        <Card>
          <CardHeader title="Action History" description="Every change and comment on this incident" />
          <div className="p-5">
            {canWrite && (
              <div className="mb-6">
                <label htmlFor="comment" className="mb-1.5 block text-sm font-medium text-ink">Add a comment</label>
                <Textarea id="comment" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share an update with the team…" />
                <div className="mt-2 flex justify-end"><Button size="sm" loading={posting} disabled={comment.trim().length < 2} onClick={postComment}>Post comment</Button></div>
              </div>
            )}
            <div className="pl-3"><Timeline events={inc.timeline} /></div>
          </div>
        </Card>
      )}

      <ResolveDialog incident={dialog ? inc : null} mode={dialog ?? 'resolve'} onClose={() => setDialog(null)} />
    </div>
  );
}
