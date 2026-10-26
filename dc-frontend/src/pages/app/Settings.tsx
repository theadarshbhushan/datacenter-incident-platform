import { useState } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, Bell, Building2, CreditCard, Gauge, Plug, ShieldCheck, User } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Callout, Card, CardHeader, ConfirmDialog, FormField, Input, Select, Switch } from '@/components/ui';
import { ChangePasswordForm, PreferencesForm, ProfileForm, SessionsList } from '@/components/forms/AccountForms';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/services/api';
import { resetMockDatabase } from '@/services/mockApi';
import { planById } from '@/data/plans';
import { isMock } from '@/config/env';
import type { MonitoringSettings, Organization } from '@/types/domain';
import type { Permission } from '@/utils/permissions';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import { NotificationsForm } from './Alerts';
import { Forbidden } from '@/routes/guards';

const sections: { id: string; label: string; icon: typeof User; permission?: Permission }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'monitoring', label: 'Monitoring', icon: Gauge },
  { id: 'integrations', label: 'Integrations', icon: Plug, permission: 'integrations:manage' },
  { id: 'billing', label: 'Subscription & billing', icon: CreditCard, permission: 'billing:view' },
];

function OrganizationSection() {
  const { session, setSession, can } = useAuth();
  const toast = useToast();
  const org = session!.organization!;
  const [form, setForm] = useState({ name: org.name, size: org.size, industry: org.industry, environmentType: org.environmentType });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const editable = can('org:manage');
  const save = async () => {
    if (form.name.trim().length < 2) return setErr('Organization name must be at least 2 characters.');
    setErr(null); setBusy(true);
    try {
      const o: Organization = await api.updateOrganization({ ...form, name: form.name.trim() });
      setSession({ ...session!, organization: o, organizations: session!.organizations.map((x) => (x.id === o.id ? { ...x, name: o.name } : x)) });
      toast.success('Organization updated');
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Organization details" description={`Created ${formatDate(org.createdAt)} · ID ${org.id}`} />
        <div className="space-y-5 p-5">
          {!editable && <Callout tone="info">Only owners can edit organization details.</Callout>}
          <FormField label="Organization name">{(p) => <Input {...p} value={form.name} disabled={!editable} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</FormField>
          <div className="grid gap-5 sm:grid-cols-3">
            <FormField label="Company size">{(p) => <Select {...p} value={form.size} disabled={!editable} onChange={(e) => setForm({ ...form, size: e.target.value })}><option value="">Not set</option>{['1-10', '11-50', '51-200', '201-1000', '1000+'].map((s) => <option key={s}>{s}</option>)}</Select>}</FormField>
            <FormField label="Industry">{(p) => <Input {...p} value={form.industry} disabled={!editable} onChange={(e) => setForm({ ...form, industry: e.target.value })} />}</FormField>
            <FormField label="Environment">{(p) => <Select {...p} value={form.environmentType} disabled={!editable} onChange={(e) => setForm({ ...form, environmentType: e.target.value as Organization['environmentType'] })}><option value="cloud">Cloud</option><option value="on-premises">On-premises</option><option value="hybrid">Hybrid</option></Select>}</FormField>
          </div>
          {err && <Callout tone="error">{err}</Callout>}
          {editable && <div className="flex justify-end"><Button onClick={save} loading={busy}>Save changes</Button></div>}
        </div>
      </Card>
      {isMock && (
        <Card className="border-critical-line">
          <CardHeader title="Demo data" description="Mock mode stores everything in this browser." />
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-muted">Reset all demo accounts, organizations and changes to their initial state.</p>
            <Button variant="outline-danger" onClick={() => setResetting(true)}>Reset demo data</Button>
          </div>
        </Card>
      )}
      <ConfirmDialog open={resetting} onClose={() => setResetting(false)} destructive title="Reset all demo data?" confirmLabel="Reset" confirmText="RESET"
        description="Every change made in this browser is erased and you will be signed out." onConfirm={async () => { await resetMockDatabase(); window.location.assign('/login'); }} />
    </div>
  );
}

function MonitoringSection() {
  const { workspace, updateMonitoring } = useWorkspace();
  const { can } = useAuth();
  const toast = useToast();
  const [m, setM] = useState<MonitoringSettings>(workspace!.monitoring);
  const [busy, setBusy] = useState(false);
  const editable = can('monitoring:manage');
  return (
    <Card>
      <CardHeader title="Monitoring" description="How telemetry is collected and analyzed for this organization." />
      <div className="space-y-5 p-5">
        {!editable && <Callout tone="info">Only owners and admins can change monitoring settings.</Callout>}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Scrape interval">{(p) => <Select {...p} disabled={!editable} value={m.scrapeIntervalSec} onChange={(e) => setM({ ...m, scrapeIntervalSec: Number(e.target.value) })}>{[10, 15, 30, 60].map((s) => <option key={s} value={s}>Every {s} seconds</option>)}</Select>}</FormField>
          <FormField label="Metric retention">{(p) => <Select {...p} disabled={!editable} value={m.retentionDays} onChange={(e) => setM({ ...m, retentionDays: Number(e.target.value) })}>{[7, 30, 90, 365].map((s) => <option key={s} value={s}>{s} days</option>)}</Select>}</FormField>
          <FormField label="Anomaly sensitivity" hint="Higher sensitivity finds more anomalies but raises more false positives.">{(p) => <Select {...p} disabled={!editable} value={m.anomalySensitivity} onChange={(e) => setM({ ...m, anomalySensitivity: e.target.value as MonitoringSettings['anomalySensitivity'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select>}</FormField>
          <FormField label="Default prediction horizon">{(p) => <Select {...p} disabled={!editable} value={m.predictionHorizon} onChange={(e) => setM({ ...m, predictionHorizon: e.target.value as MonitoringSettings['predictionHorizon'] })}><option value="6h">6 hours</option><option value="24h">24 hours</option><option value="72h">72 hours</option><option value="7d">7 days</option></Select>}</FormField>
        </div>
        <Switch label="Create incidents automatically" description="Open an incident when anomaly detection finds a high-confidence anomaly." checked={m.autoCreateIncidents} disabled={!editable} onChange={(v) => setM({ ...m, autoCreateIncidents: v })} />
        {editable && <div className="flex justify-end"><Button loading={busy} onClick={async () => { setBusy(true); try { await updateMonitoring(m); toast.success('Monitoring settings saved'); } catch (e) { toast.error('Could not save', errorMessage(e)); } finally { setBusy(false); } }}>Save changes</Button></div>}
      </div>
    </Card>
  );
}

function LinkCard({ title, text, to, cta }: { title: string; text: string; to: string; cta: string }) {
  return (
    <Card className="p-5">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{text}</p>
      <Link to={to} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">{cta} <ArrowRight className="h-4 w-4" /></Link>
    </Card>
  );
}

export default function Settings() {
  const { section = 'profile' } = useParams();
  const { can, session } = useAuth();
  const { workspace } = useWorkspace();
  const current = sections.find((s) => s.id === section);
  if (!current) return <Navigate to="/app/settings" replace />;
  const allowed = !current.permission || can(current.permission);
  const plan = planById(session!.organization!.plan);

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and organization" crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Settings', to: '/app/settings' }, { label: current.label }]} docTitle={`Settings · ${current.label}`} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {sections.filter((s) => !s.permission || can(s.permission)).map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <NavLink to={id === 'profile' ? '/app/settings' : `/app/settings/${id}`} end
                  className={() => cn('flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium', section === id ? 'bg-brand-100 text-brand-800' : 'text-ink-muted hover:bg-white hover:text-ink')}>
                  <Icon className="h-4 w-4" />{label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          {!allowed ? <Forbidden /> : (
            <>
              {section === 'profile' && <><ProfileForm /><PreferencesForm /></>}
              {section === 'organization' && <OrganizationSection />}
              {section === 'security' && <><ChangePasswordForm /><SessionsList /><Card className="p-5"><p className="font-semibold text-ink">Two-factor authentication</p><p className="mt-1 text-sm text-ink-muted">Not yet available. The backend has a placeholder for TOTP enrollment; see dc-backend README.</p></Card></>}
              {section === 'notifications' && <NotificationsForm />}
              {section === 'monitoring' && <MonitoringSection />}
              {section === 'integrations' && <LinkCard title="Integrations" text={`${workspace?.apiKeys.length ?? 0} API keys · backend, agents and cloud connections`} to="/app/integrations" cta="Manage integrations" />}
              {section === 'billing' && <LinkCard title={`Current plan: ${plan.name}`} text="View usage, change plan and billing history." to="/app/billing" cta="Open billing" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
