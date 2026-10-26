import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, Eye, MoreVertical, Plus, RotateCcw, Search, Siren, UserCheck, UserPlus, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Dialog, EmptyState, Menu, Pagination, Select, SeverityBadge, StatusBadge, Textarea } from '@/components/ui';
import { CreateIncidentDialog } from '@/components/app/CreateIncidentDialog';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage } from '@/services/api';
import type { Incident } from '@/types/domain';
import type { IncidentAction } from '@/services/types';
import { timeAgo, formatDateTime } from '@/utils/format';
import { downloadCsv } from '@/utils/csv';
import { rangeBounds, type RangeId } from '@/utils/analytics';

const PAGE_SIZE = 10;

export function useIncidentActions() {
  const { updateIncident } = useWorkspace();
  const toast = useToast();
  return async (inc: Incident, action: IncidentAction, success: string) => {
    try {
      await updateIncident(inc.id, action);
      toast.success(success, inc.id);
      return true;
    } catch (e) {
      toast.error('Action failed', errorMessage(e));
      return false;
    }
  };
}

export function ResolveDialog({ incident, mode, onClose }: { incident: Incident | null; mode: 'resolve' | 'reopen'; onClose: () => void }) {
  const run = useIncidentActions();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(''); }, [incident]);
  if (!incident) return null;
  const resolve = mode === 'resolve';
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={resolve ? `Resolve ${incident.id}?` : `Reopen ${incident.id}?`}
      description={resolve ? 'Marks the incident as resolved and records the resolution time used for MTTR.' : 'Moves the incident back to Ongoing so the team can continue working on it.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!resolve && note.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const ok = await run(incident, resolve ? { type: 'resolve', note: note.trim() || undefined } : { type: 'reopen', reason: note.trim() }, resolve ? 'Incident resolved' : 'Incident reopened');
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {resolve ? 'Resolve incident' : 'Reopen incident'}
          </Button>
        </>
      }
    >
      <label className="mb-1.5 block text-sm font-medium text-ink">{resolve ? 'Resolution note' : 'Reason for reopening'} {resolve && <span className="font-normal text-ink-faint">(optional)</span>}</label>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder={resolve ? 'What fixed it?' : 'Why is it happening again?'} />
    </Dialog>
  );
}

export default function Incidents() {
  const { workspace, memberName } = useWorkspace();
  const { can, session } = useAuth();
  const run = useIncidentActions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [resolving, setResolving] = useState<{ inc: Incident; mode: 'resolve' | 'reopen' } | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounce(q, 200);
  const ws = workspace!;
  const canWrite = can('incident:write');

  const severity = params.get('severity') ?? '';
  const status = params.get('status') ?? '';
  const rack = params.get('rack') ?? '';
  const range = (params.get('range') ?? '30d') as RangeId;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.delete('page');
    next.delete('new');
    setParams(next, { replace: true });
  };

  useEffect(() => { if (dq !== (params.get('q') ?? '')) setParam('q', dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const { from } = rangeBounds(range);
    const s = dq.trim().toLowerCase();
    return ws.incidents
      .filter((i) => !severity || i.severity === severity)
      .filter((i) => !status || (status === 'active' ? i.status !== 'resolved' : i.status === status))
      .filter((i) => !rack || i.rackId === rack)
      .filter((i) => new Date(i.createdAt).getTime() >= from || i.status !== 'resolved')
      .filter((i) => !s || i.id.toLowerCase().includes(s) || i.title.toLowerCase().includes(s) || i.serverIds.some((id) => ws.servers.find((x) => x.id === id)?.hostname.includes(s)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [ws, severity, status, rack, range, dq]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const anyFilter = !!(severity || status || rack || dq || range !== '30d');

  const component = (i: Incident) => {
    const s = ws.servers.find((x) => x.id === i.serverIds[0]);
    if (s) return s.hostname;
    const r = ws.racks.find((x) => x.id === i.rackId);
    return r ? `Rack ${r.label}` : '—';
  };

  const exportCsv = () => downloadCsv(`incidents-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((i) => ({
    id: i.id, title: i.title, severity: i.severity, status: i.status, category: i.category, component: component(i),
    detected_at: i.createdAt, resolved_at: i.resolvedAt ?? '', assignee: memberName(i.assigneeId),
  })));

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="View and manage all data center incidents"
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Incidents' }]}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!filtered.length}>Export CSV</Button>
            {canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Create Incident</Button>}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search incidents by ID, title or server…" aria-label="Search incidents" className="field h-10 pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Select aria-label="Severity" className="sm:w-36" value={severity} onChange={(e) => setParam('severity', e.target.value)}>
              <option value="">All Severity</option><option value="critical">Critical</option><option value="major">Major</option><option value="minor">Minor</option>
            </Select>
            <Select aria-label="Status" className="sm:w-36" value={status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">All Status</option><option value="active">Active (not resolved)</option><option value="ongoing">Ongoing</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option>
            </Select>
            <Select aria-label="Rack" className="sm:w-32" value={rack} onChange={(e) => setParam('rack', e.target.value)}>
              <option value="">All Racks</option>
              {ws.racks.map((r) => <option key={r.id} value={r.id}>Rack {r.label}</option>)}
            </Select>
            <Select aria-label="Date range" className="sm:w-40" value={range} onChange={(e) => setParam('range', e.target.value)}>
              <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option>
            </Select>
          </div>
          {anyFilter && (
            <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Clear</Button>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Siren className="h-5 w-5" />}
            title={ws.incidents.length ? 'No incidents match your filters' : 'No incidents yet'}
            description={ws.incidents.length ? 'Try widening the date range or clearing filters.' : 'Incidents raised by alert rules, anomaly detection or your team will appear here.'}
            action={ws.incidents.length ? <Button variant="secondary" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Clear filters</Button> : canWrite ? <Button onClick={() => setCreating(true)}>Create incident</Button> : undefined}
          />
        ) : (
          <>
            {/* Desktop/tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px]">
                <thead>
                  <tr className="border-b border-line bg-canvas/60">
                    {['ID', 'Title', 'Severity', 'Affected Component', 'Status', 'Detected Time', 'Assigned To'].map((h) => <th key={h} scope="col" className="th">{h}</th>)}
                    <th scope="col" className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas/60" onClick={() => navigate(`/app/incidents/${i.id}`)}>
                      <td className="td font-mono text-xs text-ink-muted">{i.id}</td>
                      <td className="td max-w-[280px]"><Link to={`/app/incidents/${i.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:text-brand">{i.title}</Link></td>
                      <td className="td"><SeverityBadge severity={i.severity} /></td>
                      <td className="td font-mono text-xs">{component(i)}</td>
                      <td className="td"><StatusBadge status={i.status} /></td>
                      <td className="td text-ink-muted" title={formatDateTime(i.createdAt)}>{timeAgo(i.createdAt)}</td>
                      <td className="td">{memberName(i.assigneeId)}</td>
                      <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                        <Menu
                          label={`Actions for ${i.id}`}
                          trigger={<MoreVertical className="h-4 w-4" />}
                          items={[
                            { label: 'View details', icon: <Eye className="h-4 w-4" />, onSelect: () => navigate(`/app/incidents/${i.id}`) },
                            { label: 'Acknowledge', icon: <CheckCircle2 className="h-4 w-4" />, hidden: !canWrite || i.acknowledged || i.status === 'resolved', onSelect: () => void run(i, { type: 'acknowledge' }, 'Incident acknowledged') },
                            { label: 'Assign to me', icon: <UserCheck className="h-4 w-4" />, hidden: !canWrite || i.assigneeId === session?.user.id || i.status === 'resolved', onSelect: () => void run(i, { type: 'assign', userId: session!.user.id }, 'Assigned to you') },
                            { label: 'Change assignee…', icon: <UserPlus className="h-4 w-4" />, hidden: !canWrite || i.status === 'resolved', onSelect: () => navigate(`/app/incidents/${i.id}?assign=1`) },
                            'divider',
                            { label: 'Resolve', icon: <CheckCircle2 className="h-4 w-4" />, hidden: !canWrite || i.status === 'resolved', onSelect: () => setResolving({ inc: i, mode: 'resolve' }) },
                            { label: 'Reopen', icon: <RotateCcw className="h-4 w-4" />, hidden: !canWrite || i.status !== 'resolved', onSelect: () => setResolving({ inc: i, mode: 'reopen' }) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {rows.map((i) => (
                <li key={i.id}>
                  <Link to={`/app/incidents/${i.id}`} className="block p-4 hover:bg-canvas/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-ink-muted">{i.id}</span>
                      <span className="text-xs text-ink-muted">{timeAgo(i.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink">{i.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /><span className="font-mono text-xs text-ink-muted">{component(i)}</span></div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={current} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onChange={(p) => setParam('page', String(p))} />
          </>
        )}
      </Card>
      {!canWrite && <p className="mt-3 text-xs text-ink-muted">You have read-only access. Engineers, admins and owners can create and update incidents.</p>}

      <CreateIncidentDialog open={creating} onClose={() => { setCreating(false); if (params.get('new')) setParam('new', ''); }} />
      <ResolveDialog incident={resolving?.inc ?? null} mode={resolving?.mode ?? 'resolve'} onClose={() => setResolving(null)} />
    </div>
  );
}
