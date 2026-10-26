import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud, Copy, Database, FlaskConical, KeyRound, Loader2, Plug, Plus, RefreshCw, Server, Trash2, Webhook } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, Dialog, EmptyState, FormField, Input } from '@/components/ui';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/services/api';
import type { BackendHealth, CreatedApiKey } from '@/services/types';
import type { ApiKey } from '@/types/domain';
import { config, isMock } from '@/config/env';
import { timeAgo } from '@/utils/format';

const scopes = [
  { id: 'metrics:write', label: 'Write metrics' },
  { id: 'incidents:write', label: 'Create incidents' },
  { id: 'read', label: 'Read data' },
];

const placeholders = [
  { icon: Cloud, name: 'AWS CloudWatch', text: 'Import EC2 and EBS metrics.' },
  { icon: Cloud, name: 'Azure Monitor', text: 'Import VM and host metrics.' },
  { icon: Cloud, name: 'Google Cloud Monitoring', text: 'Import Compute Engine metrics.' },
  { icon: Database, name: 'Prometheus', text: 'Remote-write or scrape existing exporters.' },
  { icon: Server, name: 'Redfish / IPMI', text: 'Hardware sensors from BMCs.' },
  { icon: Webhook, name: 'Slack / PagerDuty', text: 'Configured in Alerts → Notifications.' },
];

export default function Integrations() {
  const { workspace, reload } = useWorkspace();
  const { can } = useAuth();
  const toast = useToast();
  const ws = workspace!;
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>(['metrics:write']);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const check = async () => { setChecking(true); setHealth(await api.checkBackendHealth()); setChecking(false); };
  useEffect(() => { void check(); }, []);

  const createKey = async () => {
    if (name.trim().length < 3) return setNameErr('Name the key (at least 3 characters).');
    if (!chosen.length) return setNameErr('Choose at least one scope.');
    setNameErr(null); setBusy(true);
    try { const k = await api.createApiKey(name.trim(), chosen); setCreated(k); setCreating(false); setName(''); await reload(); }
    catch (e) { setNameErr(errorMessage(e)); } finally { setBusy(false); }
  };

  const ingestUrl = `${config.apiUrl || window.location.origin}/api/v1/metrics`;

  return (
    <div>
      <PageHeader title="Integrations" description="Connect telemetry sources and manage API access" crumbs={[{ label: 'Settings', to: '/app/settings' }, { label: 'Integrations' }]} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="FastAPI backend" description={config.apiUrl || 'Same origin (Vite proxy /api → localhost:8000)'} action={<Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={checking} onClick={check}>Check</Button>} />
          <div className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Mode:</span>
              <Badge tone={isMock ? 'warning' : 'healthy'}>{isMock ? 'Mock (in-browser)' : 'API'}</Badge>
            </div>
            {health === null ? <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</p> : health.reachable ? (
              <p className="flex items-center gap-2 text-sm text-brand-700"><CheckCircle2 className="h-4 w-4" /> Connected · {health.status}{health.version && ` · v${health.version}`}{health.latencyMs !== undefined && ` · ${health.latencyMs} ms`}</p>
            ) : (
              <Callout tone={isMock ? 'info' : 'error'} title="Backend not reachable">{health.error}</Callout>
            )}
            {isMock && <p className="text-xs text-ink-muted">To use the real backend set <code className="rounded bg-canvas px-1">VITE_API_MODE=api</code> and run <code className="rounded bg-canvas px-1">uvicorn app.main:app</code> in dc-backend.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Monitoring agents and ingestion" description="Send metrics with an API key" />
          <div className="space-y-3 p-5">
            <p className="text-sm text-ink-muted">Status: {ws.servers.length ? <span className="font-medium text-ink">{ws.servers.length} servers {ws.sample ? '(sample data)' : 'reporting'}</span> : <span className="font-medium text-ink">no servers reporting</span>}</p>
            <pre className="overflow-x-auto rounded-lg bg-[#0F1A14] p-3 font-mono text-xs leading-5 text-[#D6E4DA]">{`curl -X POST ${ingestUrl} \\
  -H "X-API-Key: $VAULTWATCH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"server_id":"srv-01","cpu_pct":42.1,"ram_pct":61.0,"temp_celsius":48.5}'`}</pre>
            <p className="text-xs text-ink-muted">The dc-ingestion service in this repository can replay realistic telemetry to this endpoint for testing.</p>
            {can('infra:manage') && !ws.sample && (
              <Button size="sm" variant="secondary" icon={<FlaskConical className="h-4 w-4" />} loading={loadingSample}
                onClick={async () => { setLoadingSample(true); try { await api.loadSampleEnvironment(); await reload(); toast.success('Sample environment loaded'); } catch (e) { toast.error('Could not load sample', errorMessage(e)); } finally { setLoadingSample(false); } }}>
                Load sample environment
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="API keys" description="Organization-scoped keys. The full key is shown once; the server stores only a hash." action={can('apiKeys:manage') && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Create key</Button>} />
        {ws.apiKeys.length === 0 ? <EmptyState icon={<KeyRound className="h-5 w-5" />} title="No API keys yet" description="Create a key for each agent or integration so you can revoke them independently." /> : (
          <div className="mt-3 overflow-x-auto border-t border-line">
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-line bg-canvas/60"><th className="th">Name</th><th className="th">Key</th><th className="th">Scopes</th><th className="th">Created</th><th className="th">Last used</th><th className="th" /></tr></thead>
              <tbody>
                {ws.apiKeys.map((k) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className="td font-medium">{k.name}</td>
                    <td className="td font-mono text-xs text-ink-muted">{k.prefix}…</td>
                    <td className="td"><span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</span></td>
                    <td className="td text-ink-muted">{timeAgo(k.createdAt)} by {k.createdBy}</td>
                    <td className="td text-ink-muted">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : 'Never'}</td>
                    <td className="td text-right">{can('apiKeys:manage') && <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5 text-critical" />} onClick={() => setRevoking(k)}>Revoke</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-ink">Cloud and infrastructure integrations</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {placeholders.map(({ icon: Icon, name: n, text }) => (
          <Card key={n} className="p-5">
            <div className="flex items-start justify-between"><Icon className="h-6 w-6 text-brand" /><Badge>Not configured</Badge></div>
            <p className="mt-3 font-semibold text-ink">{n}</p>
            <p className="mt-1 text-sm text-ink-muted">{text}</p>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-faint"><Plug className="mt-0.5 h-3.5 w-3.5 shrink-0" />Planned connector. Until then, forward metrics through the ingestion API above.</p>
          </Card>
        ))}
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Create API key" footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button loading={busy} onClick={createKey}>Create key</Button></>}>
        <div className="space-y-4">
          <FormField label="Key name" error={nameErr ?? undefined} hint="For example: rack-a-agent">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</FormField>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Scopes</legend>
            <div className="space-y-2">{scopes.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="accent-[#16834A]" checked={chosen.includes(s.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} />{s.label} <code className="text-xs text-ink-muted">{s.id}</code></label>
            ))}</div>
          </fieldset>
        </div>
      </Dialog>

      <Dialog open={!!created} onClose={() => setCreated(null)} title="Copy your API key" description="This is the only time the full key is shown. Store it in your secrets manager."
        footer={<Button onClick={() => setCreated(null)}>I've stored it safely</Button>}>
        {created && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={created.secret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="API key" />
              <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={async () => { try { await navigator.clipboard.writeText(created.secret); toast.success('Copied to clipboard'); } catch { toast.error('Copy failed', 'Select the key and copy it manually.'); } }}>Copy</Button>
            </div>
            {isMock && <p className="flex items-center gap-1.5 text-xs text-warning"><AlertCircle className="h-3.5 w-3.5" /> Demo key: it is not accepted by any real endpoint.</p>}
          </div>
        )}
      </Dialog>

      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} destructive title="Revoke API key?" confirmLabel="Revoke key"
        description={<>Anything using <strong className="text-ink">{revoking?.name}</strong> will stop working immediately.</>}
        onConfirm={async () => { try { await api.revokeApiKey(revoking!.id); await reload(); toast.success('API key revoked'); } catch (e) { toast.error('Could not revoke key', errorMessage(e)); } }} />
    </div>
  );
}
