import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud, Copy, Database, FlaskConical, KeyRound, Loader2, Plug, Plus, RefreshCw, Server, Terminal, Trash2, Webhook } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, Dialog, EmptyState, FormField, Input, Select } from '@/components/ui';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/services/api';
import type { BackendHealth, CreatedApiKey, IntegrationStatus } from '@/services/types';
import type { ApiKey } from '@/types/domain';
import { config, isMock } from '@/config/env';
import { timeAgo } from '@/utils/format';

// Only scopes the backend enforces are offered.
const scopes = [
  { id: 'metrics:write', label: 'Send telemetry' },
];

const placeholders = [
  { icon: Cloud, name: 'AWS CloudWatch', text: 'Import EC2 and EBS metrics.' },
  { icon: Cloud, name: 'Azure Monitor', text: 'Import VM and host metrics.' },
  { icon: Cloud, name: 'Google Cloud Monitoring', text: 'Import Compute Engine metrics.' },
  { icon: Database, name: 'Prometheus', text: 'Remote-write or scrape existing exporters.' },
  { icon: Server, name: 'Redfish / IPMI', text: 'Hardware sensors from BMCs.' },
  { icon: Webhook, name: 'Slack / PagerDuty', text: 'Configured in Alerts → Notifications.' },
];

/** Rack and data center names go into a shell command, so only safe characters are kept. */
const shellSafe = (v: string) => v.replace(/[^A-Za-z0-9 ._-]/g, '');

function installCommand(os: 'linux' | 'windows', site: string, key: string, rack: string, dc: string): string {
  const k = key.trim() || 'PASTE_YOUR_API_KEY';
  if (os === 'windows') {
    const extra = [rack && `$env:VAULTWATCH_RACK='${shellSafe(rack)}'`, dc && `$env:VAULTWATCH_DATACENTER='${shellSafe(dc)}'`].filter(Boolean).map((s) => `${s}; `).join('');
    return `$env:VAULTWATCH_URL='${site}'; $env:VAULTWATCH_API_KEY='${k}'; ${extra}irm ${site}/api/v1/agent/install.ps1 | iex`;
  }
  const extra = [rack && `VAULTWATCH_RACK="${shellSafe(rack)}"`, dc && `VAULTWATCH_DATACENTER="${shellSafe(dc)}"`].filter(Boolean).map((s) => `${s} `).join('');
  return `curl -fsSL ${site}/api/v1/agent/install.sh | sudo VAULTWATCH_URL=${site} VAULTWATCH_API_KEY=${k} ${extra}sh`;
}

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
  const [os, setOs] = useState<'linux' | 'windows'>('linux');
  const [installKey, setInstallKey] = useState('');
  const [rack, setRack] = useState('');
  const [dc, setDc] = useState('');

  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const check = async () => {
    setChecking(true);
    setHealth(await api.checkBackendHealth());
    if (!isMock) { try { setStatus(await api.getIntegrationStatus()); } catch { setStatus(null); } }
    setChecking(false);
  };
  useEffect(() => { void check(); }, []);

  const createKey = async () => {
    if (name.trim().length < 3) return setNameErr('Name the key (at least 3 characters).');
    if (!chosen.length) return setNameErr('Choose at least one scope.');
    setNameErr(null); setBusy(true);
    try { const k = await api.createApiKey(name.trim(), chosen); setCreated(k); setInstallKey(k.secret); setCreating(false); setName(''); await reload(); }
    catch (e) { setNameErr(errorMessage(e)); } finally { setBusy(false); }
  };

  const ingestUrl = `${config.apiUrl || window.location.origin}/api/v1/telemetry/ingest`;
  const site = window.location.origin;
  const localOnly = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const command = installCommand(os, site, installKey, rack, dc);
  const copyCommand = async () => { try { await navigator.clipboard.writeText(command); toast.success('Copied to clipboard'); } catch { toast.error('Copy failed', 'Select the command and copy it manually.'); } };
  const t = ws.telemetry;
  const telemetryLine = {
    live: `Live: ${t.serversReporting} of ${t.serversTotal} servers reported in the last 5 minutes.`,
    stale: `No telemetry since ${timeAgo(t.lastReceivedAt)}. Check that your agents are running.`,
    demo: 'Sample telemetry only. Real telemetry replaces the sample environment when it arrives.',
    waiting: 'No telemetry received yet. Monitoring is not active until an agent reports.',
  }[t.status];

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
            {status && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-ink-muted">Database</dt><dd className={status.database === 'ok' ? 'text-brand-700' : 'text-critical'}>{status.database === 'ok' ? 'Connected' : 'Unreachable'}</dd>
                <dt className="text-ink-muted">ML model</dt><dd className={status.model.ready ? 'text-brand-700' : 'text-critical'} title={status.model.error ?? undefined}>{status.model.ready ? status.model.version : 'Not loaded'}</dd>
                <dt className="text-ink-muted">Email</dt><dd className="text-ink">{status.email.delivers ? 'SMTP delivery' : 'Not delivered (console backend)'}</dd>
                <dt className="text-ink-muted">Slack / PagerDuty</dt><dd className="text-ink">{status.slack.configured ? 'Slack set' : 'Slack not set'} · {status.pagerduty.configured ? 'PagerDuty set' : 'PagerDuty not set'}</dd>
              </dl>
            )}
            {isMock && <p className="text-xs text-ink-muted">To use the real backend set <code className="rounded bg-canvas px-1">VITE_API_MODE=api</code> and run <code className="rounded bg-canvas px-1">uvicorn app.main:app</code> in dc-backend.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Monitoring agents and ingestion" description="Send metrics with an API key" />
          <div className="space-y-3 p-5">
            <p className={`text-sm ${t.status === 'live' ? 'text-brand-700' : t.status === 'stale' ? 'text-warning' : 'text-ink-muted'}`}>{telemetryLine}</p>
            {!isMock && t.status !== 'demo' && <p className="text-xs text-ink-muted">Last hour: {t.acceptedLastHour} points accepted, {t.rejectedLastHour} rejected{t.lastError ? ` (last error: ${t.lastError})` : ''}.</p>}
            <pre className="overflow-x-auto rounded-lg bg-[#0F1A14] p-3 font-mono text-xs leading-5 text-[#D6E4DA]">{`curl -X POST ${ingestUrl} \\
  -H "X-API-Key: $VAULTWATCH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"serverId":"web-01","hostname":"web-01","rack":"A01",
       "timestamp":"${new Date().toISOString()}",
       "metrics":{"cpu":42.1,"memory":61.0,"temperature":48.5,"power":410}}'`}</pre>
            <p className="text-xs text-ink-muted">Send one point or {'{"points": [...]}'} (up to 500) every 15–60 seconds. Units: percent for cpu, memory and storage; °C, W, ms, Mb/s and MB/s for the rest. The agent in dc-ingestion/agent.py reports this machine&apos;s real CPU, memory, disk and network.</p>
            {can('infra:manage') && !ws.sample && ws.servers.length === 0 && (
              <Button size="sm" variant="secondary" icon={<FlaskConical className="h-4 w-4" />} loading={loadingSample}
                onClick={async () => { setLoadingSample(true); try { await api.loadSampleEnvironment(); await reload(); toast.success('Sample environment loaded'); } catch (e) { toast.error('Could not load sample', errorMessage(e)); } finally { setLoadingSample(false); } }}>
                Load sample environment
              </Button>
            )}
          </div>
        </Card>
      </div>

      {!isMock && (
        <Card className="mt-4">
          <CardHeader title="Install the agent on a server" description="Run one command. The server connects by itself, appears on the dashboard and keeps reporting after a restart." />
          <div className="space-y-3 p-5">
            {localOnly && <Callout tone="warning" title="This site is only on this computer">Other machines cannot reach {site}. Deploy VaultWatch first, then copy the command from your public site. See docs/DEPLOYMENT.md.</Callout>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Operating system">{(p) => <Select {...p} value={os} onChange={(e) => setOs(e.target.value as typeof os)}><option value="linux">Linux</option><option value="windows">Windows</option></Select>}</FormField>
              <FormField label="API key" hint="Create one below. It is shown once.">{(p) => <Input {...p} value={installKey} onChange={(e) => setInstallKey(e.target.value)} className="font-mono text-xs" autoComplete="off" />}</FormField>
              <FormField label="Rack (optional)">{(p) => <Input {...p} value={rack} onChange={(e) => setRack(e.target.value)} maxLength={32} />}</FormField>
              <FormField label="Data center (optional)">{(p) => <Input {...p} value={dc} onChange={(e) => setDc(e.target.value)} maxLength={80} />}</FormField>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-[#0F1A14] p-3 font-mono text-xs leading-5 text-[#D6E4DA]">{command}</pre>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copyCommand}>Copy command</Button>
              <p className="flex items-center gap-1.5 text-xs text-ink-muted"><Terminal className="h-3.5 w-3.5" />{os === 'windows' ? 'Run in PowerShell as Administrator.' : 'Run in a terminal with sudo access.'}</p>
            </div>
          </div>
        </Card>
      )}

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
