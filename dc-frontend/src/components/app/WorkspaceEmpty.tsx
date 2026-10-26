import { useState } from 'react';
import { FlaskConical, Plug, Plus } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/services/api';

/** Shown when an organization has no infrastructure yet. */
export function WorkspaceEmpty({ title = 'No infrastructure connected yet', compact }: { title?: string; compact?: boolean }) {
  const { can } = useAuth();
  const { reload } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { await api.loadSampleEnvironment(); await reload(); toast.success('Sample environment loaded', 'All sample data is labeled. Replace it by connecting real infrastructure.'); }
    catch (e) { toast.error('Could not load sample data', errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className={`card flex flex-col items-center px-6 text-center ${compact ? 'py-8' : 'py-14'}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand"><Plug className="h-6 w-6" /></span>
      <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-ink-muted">Connect a monitoring agent or the ingestion API to see live servers, or explore with a clearly labeled sample environment.</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {can('integrations:manage') && <ButtonLink to="/app/integrations" icon={<Plug className="h-4 w-4" />}>Connect infrastructure</ButtonLink>}
        {can('infra:manage') && <Button variant="secondary" loading={busy} icon={<FlaskConical className="h-4 w-4" />} onClick={load}>Load sample environment</Button>}
        {!can('infra:manage') && can('incident:write') && <ButtonLink to="/app/incidents?new=1" variant="secondary" icon={<Plus className="h-4 w-4" />}>Create incident</ButtonLink>}
      </div>
      {!can('infra:manage') && <p className="mt-3 text-xs text-ink-faint">Ask an owner or admin to connect infrastructure.</p>}
    </div>
  );
}
