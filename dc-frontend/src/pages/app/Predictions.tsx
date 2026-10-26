import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BrainCircuit, Flame, HardDrive, Info, MemoryStick, Network, Plug, Plus, Search, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Callout, Card, CardHeader, Dialog, EmptyState, SampleBadge, Select } from '@/components/ui';
import { Legend, RiskHeatmap, SimpleBarChart, riskColor } from '@/components/charts/Charts';
import { CreateIncidentDialog } from '@/components/app/CreateIncidentDialog';
import { WorkspaceEmpty } from '@/components/app/WorkspaceEmpty';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import type { Prediction, PredictionHorizon } from '@/types/domain';
import { formatDateTime, pct, timeAgo } from '@/utils/format';

const horizonHours: Record<PredictionHorizon, number> = { '6h': 6, '24h': 24, '72h': 72, '7d': 168 };
const horizonLabel: Record<PredictionHorizon, string> = { '6h': 'next 6 hours', '24h': 'next 24 hours', '72h': 'next 3 days', '7d': 'next 7 days' };
const heatCols = ['Now', '4h', '8h', '12h', '16h', '20h', '24h'];

/** Probability of an incident by time t (hours), assuming risk accumulates toward the horizon. */
function probAt(p: Prediction, t: number) {
  const h = horizonHours[p.horizon];
  return p.probability * Math.min(1, Math.pow((t + 1.5) / h, 0.6));
}

function typeIcon(type: string) {
  if (type.startsWith('Thermal')) return Flame;
  if (type.startsWith('Memory')) return MemoryStick;
  if (type.startsWith('Disk')) return HardDrive;
  if (type.startsWith('Power')) return Zap;
  return Network;
}

function riskTone(p: number) {
  return p >= 0.8 ? 'bg-critical-bg text-critical' : p >= 0.6 ? 'bg-orange-bg text-orange' : p >= 0.4 ? 'bg-warning-bg text-warning' : 'bg-healthy-bg text-brand-700';
}

function Bar({ value, color }: { value: number; color: string }) {
  return <span className="block h-1.5 w-full rounded-full bg-line"><span className="block h-1.5 rounded-full" style={{ width: `${value * 100}%`, backgroundColor: color }} /></span>;
}

export default function Predictions() {
  const { workspace } = useWorkspace();
  const { can } = useAuth();
  const { predictionId } = useParams();
  const navigate = useNavigate();
  const ws = workspace!;
  const [dc, setDc] = useState('');
  const [rack, setRack] = useState('');
  const [horizon, setHorizon] = useState('');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [creatingFrom, setCreatingFrom] = useState<Prediction | null>(null);

  const host = (id: string) => ws.servers.find((s) => s.id === id)?.hostname ?? id;
  const rackLabel = (id: string) => ws.racks.find((r) => r.id === id)?.label ?? '?';

  const filtered = useMemo(() => ws.predictions
    .filter((p) => !dc || p.dcId === dc)
    .filter((p) => !rack || p.rackId === rack)
    .filter((p) => !horizon || p.horizon === horizon)
    .filter((p) => !q || host(p.serverId).includes(q.toLowerCase()) || p.type.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.probability - a.probability), [ws, dc, rack, horizon, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const heat = useMemo(() => {
    const top = filtered.slice(0, 4).map((p) => ({ id: p.id, label: host(p.serverId), values: heatCols.map((_, i) => probAt(p, i * 4)) }));
    const racks = [...new Set(filtered.map((p) => p.rackId))]
      .map((rid) => {
        const preds = filtered.filter((p) => p.rackId === rid);
        return { id: rid, label: `Rack-${rackLabel(rid)}`, values: heatCols.map((_, i) => Math.max(...preds.map((p) => probAt(p, i * 4)))) };
      })
      .sort((a, b) => b.values[6]! - a.values[6]!)
      .slice(0, 4);
    return [...top, ...racks];
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = useMemo(() => {
    const m = new Map<string, number>();
    filtered.filter((p) => p.probability >= 0.3).forEach((p) => m.set(p.type, (m.get(p.type) ?? 0) + 1));
    return [...m.entries()].map(([label, value]) => ({ label: label.replace(' ', '\n'), value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const selected = predictionId ? ws.predictions.find((p) => p.id === predictionId) : undefined;
  const top = filtered.slice(0, showAll ? 12 : 4);

  if (ws.servers.length === 0) {
    return (
      <div>
        <PageHeader title="AI Prediction & Risk Analysis" description="Predict potential incidents using machine learning" crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Prediction' }]} />
        <WorkspaceEmpty title="Predictions need infrastructure data" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="AI Prediction & Risk Analysis"
        description="Predict potential incidents using machine learning"
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Prediction' }]}
        actions={
          ws.model ? (
            <div className="flex flex-wrap items-center gap-2">
              {ws.model.sample && <SampleBadge label="Sample predictions" />}
              <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-muted" title={`${ws.model.name} · version ${ws.model.version}`}>
                Model Confidence: <span className="font-semibold text-brand">{pct(ws.model.confidence)}</span>
                <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
              </span>
            </div>
          ) : <Badge tone="neutral">No model connected</Badge>
        }
      />

      <Callout tone="info" className="mb-5" title="Probability and confidence are different numbers">
        <strong className="text-ink">Incident probability</strong> is the estimated chance an incident occurs within the time horizon. <strong className="text-ink">Model confidence</strong> is how reliable the model judges that estimate to be.
        {ws.model?.sample && ' These predictions are sample data, not output from a live model.'}
      </Callout>

      {!ws.model && (
        <Callout tone="warning" className="mb-5" title="No prediction model connected" action={can('integrations:manage') ? <Link to="/app/integrations" className="text-sm font-medium text-brand">Set up</Link> : undefined}>
          Connect the ML service (dc-ml) to generate predictions from your telemetry.
        </Callout>
      )}

      <Card className="mb-4">
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <Select aria-label="Time horizon" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
            <option value="">All horizons</option>
            {(Object.keys(horizonLabel) as PredictionHorizon[]).map((h) => <option key={h} value={h}>{horizonLabel[h].replace('next', 'Next')}</option>)}
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card><EmptyState icon={<BrainCircuit className="h-5 w-5" />} title="No predictions match these filters" /></Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Risk Heatmap (Next 24 Hours)" description="Probability of an incident by time, top servers and racks" action={<Legend items={[{ label: 'Low', color: riskColor(0.1) }, { label: 'Medium', color: riskColor(0.55) }, { label: 'High', color: riskColor(0.95) }]} />} />
              <div className="p-5">
                <RiskHeatmap rows={heat} columns={heatCols} onSelect={(id) => { const p = filtered.find((x) => x.id === id) ?? filtered.find((x) => x.rackId === id); if (p) navigate(`/app/predictions/${p.id}`); }} />
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Top Predicted Risks" action={filtered.length > 4 && <button className="text-sm font-medium text-brand hover:underline" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show less' : 'View All'}</button>} />
              <ul className="space-y-2 p-5 pt-3">
                {top.map((p) => {
                  const Icon = typeIcon(p.type);
                  return (
                    <li key={p.id}>
                      <Link to={`/app/predictions/${p.id}`} className="flex items-center gap-3 rounded-xl border border-transparent p-2 hover:border-line hover:bg-canvas/60">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${riskTone(p.probability)}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{p.type} ({host(p.serverId)})</span>
                          <span className="block text-xs text-ink-muted">Likely in {horizonLabel[p.horizon]} · confidence {pct(p.confidence)}</span>
                        </span>
                        <span className={`rounded-md px-2 py-1 text-sm font-bold ${riskTone(p.probability)}`}>{pct(p.probability)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Predicted Incident Types" description="Assets with probability of 30% or more" />
              <div className="p-5">{types.length ? <SimpleBarChart data={types.map((t) => ({ ...t, label: t.label.replace('\n', ' ') }))} layout="horizontal-bars" height={220} name="Assets" /> : <p className="py-10 text-center text-sm text-ink-muted">No elevated risks.</p>}</div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="All Predictions" description={`${filtered.length} assets`} />
              <div className="mt-3 max-h-[420px] overflow-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0 bg-white"><tr className="border-y border-line"><th className="th">Server</th><th className="th">Predicted type</th><th className="th w-36">Probability</th><th className="th w-36">Confidence</th><th className="th">Horizon</th></tr></thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas/60" onClick={() => navigate(`/app/predictions/${p.id}`)}>
                        <td className="td"><Link to={`/app/predictions/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs hover:text-brand">{host(p.serverId)}</Link><span className="block text-[11px] text-ink-muted">Rack {rackLabel(p.rackId)}</span></td>
                        <td className="td">{p.type}</td>
                        <td className="td"><span className="mb-1 block text-xs font-medium">{pct(p.probability)}</span><Bar value={p.probability} color={riskColor(p.probability)} /></td>
                        <td className="td"><span className="mb-1 block text-xs font-medium">{pct(p.confidence)}</span><Bar value={p.confidence} color="#7C3AED" /></td>
                        <td className="td text-ink-muted">{p.horizon}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      <Dialog
        open={!!predictionId}
        onClose={() => navigate('/app/predictions')}
        size="lg"
        title={selected ? `${selected.type} · ${host(selected.serverId)}` : 'Prediction not found'}
        description={selected ? `Rack ${rackLabel(selected.rackId)} · generated ${timeAgo(selected.generatedAt)}` : undefined}
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
            {selected.sample && <SampleBadge label="Sample prediction, not from a live model" />}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs text-ink-muted">Incident probability</p>
                <p className="mt-1 text-3xl font-bold" style={{ color: selected.probability >= 0.6 ? '#DC2626' : '#17211C' }}>{pct(selected.probability)}</p>
                <p className="mt-1 text-xs text-ink-muted">Chance of {selected.type.toLowerCase()} in the {horizonLabel[selected.horizon]}</p>
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs text-ink-muted">Model confidence</p>
                <p className="mt-1 text-3xl font-bold text-violet">{pct(selected.confidence)}</p>
                <p className="mt-1 text-xs text-ink-muted">How reliable the model considers this estimate</p>
              </div>
            </div>
            <p className="text-sm text-ink-muted">Expected around <span className="font-medium text-ink">{formatDateTime(selected.expectedAt)}</span> if nothing changes.</p>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Contributing factors</p>
              <ul className="space-y-2">
                {selected.factors.map((f) => (
                  <li key={f.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[180px_1fr_auto]">
                    <span className="text-ink-muted">{f.label}</span>
                    <span className="order-3 col-span-2 sm:order-none sm:col-span-1"><Bar value={f.weight} color="#7C3AED" /></span>
                    <span className="font-medium text-ink">{f.value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-brand-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Info className="h-4 w-4 text-brand" /> Recommendation</p>
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
          title: `Predicted ${creatingFrom.type.toLowerCase()} on ${host(creatingFrom.serverId)}`,
          description: `Opened from a prediction: ${pct(creatingFrom.probability)} probability in the ${horizonLabel[creatingFrom.horizon]} (model confidence ${pct(creatingFrom.confidence)}). ${creatingFrom.recommendation}`,
          severity: creatingFrom.probability >= 0.8 ? 'critical' : 'major',
          category: creatingFrom.type.startsWith('Thermal') ? 'thermal' : creatingFrom.type.startsWith('Memory') ? 'software' : creatingFrom.type.startsWith('Disk') ? 'storage' : creatingFrom.type.startsWith('Power') ? 'power' : 'network',
          rackId: creatingFrom.rackId,
          serverIds: [creatingFrom.serverId],
        } : undefined}
      />
    </div>
  );
}
