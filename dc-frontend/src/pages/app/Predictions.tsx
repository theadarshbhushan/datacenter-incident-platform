import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, BrainCircuit, Flame, HardDrive, Info, MemoryStick, Network, Plug, Plus, RefreshCw, Search, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Callout, Card, CardHeader, Dialog, EmptyState, SampleBadge, Select } from '@/components/ui';
import { SimpleBarChart } from '@/components/charts/Charts';
import { CreateIncidentDialog } from '@/components/app/CreateIncidentDialog';
import { WorkspaceEmpty } from '@/components/app/WorkspaceEmpty';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/services/api';
import { isMock } from '@/config/env';
import type { Prediction } from '@/types/domain';
import { capitalize, formatDateTime, pct, timeAgo } from '@/utils/format';
import { categoryLabels } from '@/utils/analytics';

function typeIcon(p: Prediction) {
  if (p.category === 'thermal') return Flame;
  if (p.category === 'software') return MemoryStick;
  if (p.category === 'storage') return HardDrive;
  if (p.category === 'power') return Zap;
  if (p.category === 'network') return Network;
  return Activity;
}

const sevTone = { critical: 'bg-critical-bg text-critical', warning: 'bg-warning-bg text-warning', normal: 'bg-healthy-bg text-brand-700' } as const;

/** The number to show for a prediction, with what it means. Never presents an uncalibrated score as a probability. */
function headline(p: Prediction): { value: string; label: string } {
  if (p.kind === 'anomaly') return { value: p.anomalyScore === null ? '—' : p.anomalyScore.toFixed(2), label: 'anomaly score' };
  if (p.probability !== null && p.probabilityCalibrated) return { value: pct(p.probability), label: 'probability (1h)' };
  return { value: p.riskScore === null ? '—' : p.riskScore.toFixed(2), label: 'risk score (uncalibrated)' };
}

function Bar({ value, color }: { value: number; color: string }) {
  return <span className="block h-1.5 w-full rounded-full bg-line"><span className="block h-1.5 rounded-full" style={{ width: `${Math.min(1, value) * 100}%`, backgroundColor: color }} /></span>;
}

export default function Predictions() {
  const { workspace, reload } = useWorkspace();
  const { can } = useAuth();
  const toast = useToast();
  const { predictionId } = useParams();
  const navigate = useNavigate();
  const ws = workspace!;
  const [dc, setDc] = useState('');
  const [rack, setRack] = useState('');
  const [kind, setKind] = useState<'' | Prediction['kind']>('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [q, setQ] = useState('');
  const [running, setRunning] = useState(false);
  const [creatingFrom, setCreatingFrom] = useState<Prediction | null>(null);

  const host = (id: string) => ws.servers.find((s) => s.id === id)?.hostname ?? id;
  const rackLabel = (id: string) => ws.racks.find((r) => r.id === id)?.label ?? '?';
  const model = ws.model;
  const evalAlert = model?.evaluation?.anomaly_loso_alert_rule;
  const evalEw = model?.evaluation?.early_warning;

  const filtered = useMemo(() => ws.predictions
    .filter((p) => !dc || p.dcId === dc)
    .filter((p) => !rack || p.rackId === rack)
    .filter((p) => !kind || p.kind === kind)
    .filter((p) => !onlyFlagged || p.severity !== 'normal')
    .filter((p) => !q || host(p.serverId).toLowerCase().includes(q.toLowerCase()) || p.type.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.severity === 'critical' ? 2 : b.severity === 'warning' ? 1 : 0) - (a.severity === 'critical' ? 2 : a.severity === 'warning' ? 1 : 0)
      || ((b.anomalyScore ?? b.riskScore ?? 0) - (a.anomalyScore ?? a.riskScore ?? 0))), [ws, dc, rack, kind, onlyFlagged, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const anomalies = filtered.filter((p) => p.kind === 'anomaly' && p.severity !== 'normal');
  const early = filtered.filter((p) => p.kind === 'early_warning' && p.severity !== 'normal');
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    filtered.filter((p) => p.severity !== 'normal').forEach((p) => m.set(categoryLabels[p.category] ?? p.category, (m.get(categoryLabels[p.category] ?? p.category) ?? 0) + 1));
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const selected = predictionId ? ws.predictions.find((p) => p.id === predictionId) : undefined;
  const anySample = ws.predictions.some((p) => p.sample);

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await api.runPredictions();
      await reload();
      toast.success('Predictions updated', `Scored ${r.scored} of ${r.servers} servers${r.skipped ? `; ${r.skipped} had no recent telemetry or too little history` : ''}.`);
    } catch (e) {
      toast.error('Could not run predictions', errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  if (ws.servers.length === 0) {
    return (
      <div>
        <PageHeader title="AI Prediction & Risk Analysis" description="Anomaly detection and early warnings from your telemetry" crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Prediction' }]} />
        <WorkspaceEmpty title="Predictions need infrastructure data" />
      </div>
    );
  }

  const Row = ({ p }: { p: Prediction }) => {
    const Icon = typeIcon(p);
    const h = headline(p);
    return (
      <li>
        <Link to={`/app/predictions/${p.id}`} className="flex items-center gap-3 rounded-xl border border-transparent p-2 hover:border-line hover:bg-canvas/60">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${sevTone[p.severity]}`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{p.type} ({host(p.serverId)})</span>
            <span className="block text-xs text-ink-muted">{p.kind === 'anomaly' ? 'Now' : 'Next hour · experimental'} · {p.confidence} confidence · {timeAgo(p.generatedAt)}</span>
          </span>
          <span className={`rounded-md px-2 py-1 text-right text-sm font-bold ${sevTone[p.severity]}`} title={h.label}>{h.value}</span>
        </Link>
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        title="AI Prediction & Risk Analysis"
        description="Anomaly detection and early warnings from your telemetry"
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Prediction' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {anySample && <SampleBadge label={isMock ? 'Sample predictions' : 'Model output on sample telemetry'} />}
            {model?.ready
              ? <Badge tone="violet" className="h-9 px-3"><BrainCircuit className="h-3.5 w-3.5" /> {model.version}</Badge>
              : <Badge tone="neutral">{isMock ? 'No model in demo mode' : 'Model not loaded'}</Badge>}
            {!isMock && can('predictions:run') && <Button variant="secondary" loading={running} icon={<RefreshCw className="h-4 w-4" />} onClick={runNow} disabled={!model?.ready}>Run now</Button>}
          </div>
        }
      />

      {!isMock && !model?.ready && (
        <Callout tone="warning" className="mb-5" title="The prediction model is not loaded">
          {model?.error ?? 'The backend could not load its model artifact.'} No predictions are shown until it loads; nothing here is estimated without it.
        </Callout>
      )}

      <Callout tone="info" className="mb-5" title="What these numbers mean">
        <span className="block"><strong className="text-ink">Anomaly score</strong> (0–1) ranks how unusual a server&apos;s latest 5-minute reading is against its own 24-hour baseline. It detects problems happening now and is <strong className="text-ink">not a probability</strong>.</span>
        <span className="mt-1 block"><strong className="text-ink">Early warning</strong> is experimental: the chance a metric surges within the next hour. It is shown as a probability only when its calibration passed testing{model?.earlyWarning && !model.earlyWarning.probabilityCalibrated ? ' (it did not for this model, so a risk score is shown)' : ''}. It does not predict hardware failures.</span>
        <span className="mt-1 block"><strong className="text-ink">Confidence</strong> describes how much history backs the result, and whether that metric type was in the labeled evaluation data.</span>
        {evalAlert && (
          <span className="mt-2 block text-xs">
            Held-out evaluation on real labeled data (NAB): the alert rule caught {evalAlert.windows_detected} of {evalAlert.windows_total} labeled anomaly windows with {evalAlert.false_alarm_episodes_per_day} false alarm episodes per server per day
            {evalEw ? `; early warning PR-AUC ${evalEw.pr_auc} vs a base rate of ${evalEw.base_rate}` : ''}. Details in the model card (dc-backend/app/ml/artifacts/MODEL_CARD.md).
          </span>
        )}
      </Callout>

      <Card className="mb-4">
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input className="field h-10 pl-9" placeholder="Filter by server or type" aria-label="Filter by server or type" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Data center" value={dc} onChange={(e) => { setDc(e.target.value); setRack(''); }}>
            <option value="">All data centers</option>
            {ws.dataCenters.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select aria-label="Rack" value={rack} onChange={(e) => setRack(e.target.value)}>
            <option value="">All racks</option>
            {ws.racks.filter((r) => !dc || r.dcId === dc).map((r) => <option key={r.id} value={r.id}>Rack {r.label}</option>)}
          </Select>
          <Select aria-label="Prediction kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="">Anomalies and early warnings</option>
            <option value="anomaly">Anomaly detection (now)</option>
            <option value="early_warning">Early warning (next hour)</option>
          </Select>
          <Select aria-label="Severity filter" value={onlyFlagged ? 'flagged' : ''} onChange={(e) => setOnlyFlagged(e.target.value === 'flagged')}>
            <option value="">All severities</option>
            <option value="flagged">Flagged only</option>
          </Select>
        </div>
      </Card>

      {ws.predictions.length === 0 ? (
        <Card><EmptyState icon={<BrainCircuit className="h-5 w-5" />} title="No predictions yet" description="The model scores each server once it has at least 4 hours of telemetry. Predictions appear here as 5-minute buckets complete." /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<BrainCircuit className="h-5 w-5" />} title="No predictions match these filters" /></Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Anomalous now" description="Anomaly detection on the latest complete 5-minute reading" />
              {anomalies.length ? <ul className="space-y-2 p-5 pt-3">{anomalies.slice(0, 6).map((p) => <Row key={p.id} p={p} />)}</ul> : <p className="p-5 text-sm text-ink-muted">No server is unusual right now.</p>}
            </Card>
            <Card>
              <CardHeader title="Early warnings (next hour)" description="Experimental: a metric is likely to surge" action={<Badge tone="warning">Experimental</Badge>} />
              {early.length ? <ul className="space-y-2 p-5 pt-3">{early.slice(0, 6).map((p) => <Row key={p.id} p={p} />)}</ul> : <p className="p-5 text-sm text-ink-muted">No early warnings right now.</p>}
            </Card>
            <Card>
              <CardHeader title="Flagged by category" description="Warnings and critical results in the current filter" />
              <div className="p-5">{byCategory.length ? <SimpleBarChart data={byCategory} layout="horizontal-bars" height={220} name="Predictions" /> : <p className="py-10 text-center text-sm text-ink-muted">Nothing flagged.</p>}</div>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="All predictions" description={`${filtered.length} current results (newest per server and kind)`} />
            <div className="mt-3 max-h-[480px] overflow-auto">
              <table className="w-full min-w-[760px]">
                <thead className="sticky top-0 bg-white"><tr className="border-y border-line"><th className="th">Server</th><th className="th">Kind</th><th className="th">Type</th><th className="th w-40">Score</th><th className="th">Severity</th><th className="th">Confidence</th><th className="th">Data time</th></tr></thead>
                <tbody>
                  {filtered.map((p) => {
                    const h = headline(p);
                    const v = p.kind === 'anomaly' ? p.anomalyScore ?? 0 : p.probability ?? p.riskScore ?? 0;
                    return (
                      <tr key={p.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas/60" onClick={() => navigate(`/app/predictions/${p.id}`)}>
                        <td className="td"><Link to={`/app/predictions/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs hover:text-brand">{host(p.serverId)}</Link><span className="block text-[11px] text-ink-muted">Rack {rackLabel(p.rackId)}</span></td>
                        <td className="td text-ink-muted">{p.kind === 'anomaly' ? 'Anomaly (now)' : 'Early warning (1h)'}</td>
                        <td className="td">{p.type}</td>
                        <td className="td"><span className="mb-1 block text-xs font-medium">{h.value} <span className="font-normal text-ink-muted">{h.label}</span></span><Bar value={v} color={p.severity === 'critical' ? '#DC2626' : p.severity === 'warning' ? '#D97706' : '#16834A'} /></td>
                        <td className="td"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${sevTone[p.severity]}`}>{capitalize(p.severity)}</span></td>
                        <td className="td text-ink-muted" title={p.confidenceReason}>{capitalize(p.confidence)}</td>
                        <td className="td text-ink-muted">{timeAgo(p.dataTime)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Dialog
        open={!!predictionId}
        onClose={() => navigate('/app/predictions')}
        size="lg"
        title={selected ? `${selected.type} · ${host(selected.serverId)}` : 'Prediction not found'}
        description={selected ? `Rack ${rackLabel(selected.rackId)} · generated ${timeAgo(selected.generatedAt)} · model ${selected.modelVersion}` : undefined}
        footer={selected && (
          <>
            <Button variant="secondary" onClick={() => navigate('/app/predictions')}>Close</Button>
            <Link to={`/app/infrastructure?server=${selected.serverId}`} className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-canvas">View server</Link>
            {can('incident:write') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreatingFrom(selected)}>Create incident</Button>}
          </>
        )}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {selected.sample && <SampleBadge label={isMock ? 'Sample prediction, no model ran' : 'Model output on sample telemetry'} />}
              {selected.experimental && <Badge tone="warning">Experimental</Badge>}
              <Badge tone="neutral">{selected.kind === 'anomaly' ? 'Detects the present' : 'Forecasts the next hour'}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs text-ink-muted">{capitalize(headline(selected).label)}</p>
                <p className="mt-1 text-3xl font-bold text-ink">{headline(selected).value}</p>
                <p className="mt-1 text-xs text-ink-muted">{selected.kind === 'anomaly' ? 'Percentile of the training score distribution. Not a probability.' : selected.probabilityCalibrated ? 'Calibrated on held-out data.' : 'Not calibrated: compare scores, do not read them as chances.'}</p>
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs text-ink-muted">Severity</p>
                <p className={`mt-1 inline-block rounded-md px-2 py-0.5 text-lg font-bold ${sevTone[selected.severity]}`}>{capitalize(selected.severity)}</p>
                <p className="mt-1 text-xs text-ink-muted">From fixed model thresholds.</p>
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs text-ink-muted">Confidence</p>
                <p className="mt-1 text-lg font-bold text-violet">{capitalize(selected.confidence)}</p>
                <p className="mt-1 text-xs text-ink-muted">{selected.confidenceReason}</p>
              </div>
            </div>
            <p className="text-sm text-ink-muted">Based on the reading at <span className="font-medium text-ink">{formatDateTime(selected.dataTime)}</span>{selected.expectedAt && <> · horizon until <span className="font-medium text-ink">{formatDateTime(selected.expectedAt)}</span></>}.</p>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Contributing factors</p>
              <ul className="space-y-2">
                {selected.factors.map((f) => (
                  <li key={f.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[140px_1fr_auto]">
                    <span className="text-ink-muted">{f.label}</span>
                    <span className="order-3 col-span-2 sm:order-none sm:col-span-1" title={`Score ${f.weight.toFixed(2)}`}><Bar value={f.weight} color="#7C3AED" /></span>
                    <span className="font-medium text-ink">{f.value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-brand-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Info className="h-4 w-4 text-brand" /> Suggested next step</p>
              <p className="mt-1 text-sm text-ink">{selected.recommendation}</p>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Plug className="h-5 w-5" />} title="This prediction doesn't exist" description="It may have been replaced by a newer prediction run." />
        )}
      </Dialog>

      <CreateIncidentDialog
        open={!!creatingFrom}
        onClose={() => setCreatingFrom(null)}
        defaults={creatingFrom ? {
          title: `${creatingFrom.type} on ${host(creatingFrom.serverId)}`,
          description: `Opened from a ${creatingFrom.kind === 'anomaly' ? 'model anomaly detection' : 'experimental early warning'}: ${headline(creatingFrom).label} ${headline(creatingFrom).value}, severity ${creatingFrom.severity}, ${creatingFrom.confidence} confidence (model ${creatingFrom.modelVersion}). ${creatingFrom.recommendation}`,
          severity: creatingFrom.severity === 'critical' ? 'critical' : 'major',
          category: creatingFrom.category,
          rackId: creatingFrom.rackId,
          serverIds: [creatingFrom.serverId],
        } : undefined}
      />
    </div>
  );
}
