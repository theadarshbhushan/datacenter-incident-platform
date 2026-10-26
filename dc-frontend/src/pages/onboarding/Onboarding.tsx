import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Cloud, Database, FlaskConical, Plug, Plus, Rocket, Server, Trash2, Users } from 'lucide-react';
import type { ZodSchema } from 'zod';
import { Button, Callout, ConfirmDialog, FieldError, FormField, Input, Logo, PageLoader, Select } from '@/components/ui';
import { MockBanner } from '@/components/layout/MockBanner';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/services/api';
import type { OnboardingInput } from '@/services/types';
import { infraStepSchema, inviteRowSchema, orgStepSchema } from '@/schemas/onboarding';
import { roleLabels } from '@/utils/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/utils/cn';

interface Draft {
  organization: { name: string; size: string; industry: string };
  infrastructure: { dataCenterName: string; environmentName: string; serverCount: string; environmentType: 'cloud' | 'on-premises' | 'hybrid' };
  monitoringMode: 'demo' | 'connect' | 'later';
  invites: { email: string; role: 'admin' | 'engineer' | 'viewer' }[];
}

const steps = ['Welcome', 'Organization', 'Infrastructure', 'Monitoring', 'Team', 'Review'];
const sizes = ['1-10', '11-50', '51-200', '201-1000', '1000+'];
const industries = ['Colocation provider', 'Cloud / SaaS', 'Enterprise IT', 'Managed service provider', 'Telecom / Edge', 'Financial services', 'Healthcare', 'Government / Public sector', 'Other'];

type Errors = Record<string, string>;

function validate<T>(schema: ZodSchema<T>, value: unknown): Errors {
  const r = schema.safeParse(value);
  if (r.success) return {};
  const out: Errors = {};
  r.error.issues.forEach((i) => { const k = i.path.join('.'); if (!out[k]) out[k] = i.message; });
  return out;
}

export default function Onboarding() {
  useDocumentTitle('Set up your workspace');
  const { session, setSession } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<'finish' | 'skip' | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const loaded = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!session || loaded.current) return;
    loaded.current = true;
    const base: Draft = {
      organization: { name: session.organization?.name ?? '', size: '', industry: '' },
      infrastructure: { dataCenterName: '', environmentName: 'Production', serverCount: '', environmentType: 'hybrid' },
      monitoringMode: 'demo',
      invites: [],
    };
    api.getOnboardingDraft()
      .then((saved) => {
        if (saved?.draft && typeof saved.draft === 'object') {
          setDraft({ ...base, ...(saved.draft as Partial<Draft>) });
          setStep(Math.min(Math.max(0, saved.step), steps.length - 1));
        } else setDraft(base);
      })
      .catch(() => setDraft(base));
  }, [session]);

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  if (!session) return null;
  if (!session.user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (session.user.onboardingCompleted) return <Navigate to="/app/dashboard" replace />;
  if (!draft) return <div className="min-h-screen bg-canvas"><PageLoader label="Loading your setup…" /></div>;

  const isOwner = session.role === 'owner';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const stepErrors = (i: number): Errors => {
    if (i === 1) return validate(orgStepSchema, draft.organization);
    if (i === 2) return validate(infraStepSchema, draft.infrastructure);
    if (i === 4) {
      const out: Errors = {};
      const seen = new Set<string>();
      draft.invites.forEach((row, idx) => {
        const e = validate(inviteRowSchema, row);
        if (e.email) out[`invites.${idx}`] = e.email;
        else if (row.email.toLowerCase() === session.user.email) out[`invites.${idx}`] = "You're already a member";
        else if (seen.has(row.email.toLowerCase())) out[`invites.${idx}`] = 'Duplicate email';
        seen.add(row.email.toLowerCase());
      });
      return out;
    }
    return {};
  };

  const go = (to: number) => {
    if (to > step) {
      const e = stepErrors(step);
      setErrors(e);
      if (Object.keys(e).length) return;
    } else setErrors({});
    setStep(to);
    // Save-and-resume: persist progress so a refresh or later visit picks up here.
    void api.saveOnboardingDraft(to, draft).catch(() => undefined);
  };

  const finish = async () => {
    setServerError(null);
    setBusy('finish');
    try {
      const input: OnboardingInput = {
        organization: draft.organization,
        infrastructure: { ...draft.infrastructure, serverCount: Number(draft.infrastructure.serverCount) },
        monitoringMode: draft.monitoringMode,
        invites: draft.invites,
      };
      const s = await api.completeOnboarding(input);
      setSession(s);
      toast.success('Your workspace is ready', draft.invites.length ? `${draft.invites.length} invitation${draft.invites.length > 1 ? 's' : ''} created.` : undefined);
      navigate('/app/dashboard', { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    } finally { setBusy(null); }
  };

  const skip = async () => {
    setBusy('skip');
    try {
      const s = await api.skipOnboarding();
      setSession(s);
      navigate('/app/dashboard', { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    } finally { setBusy(null); }
  };

  const content: Record<number, ReactNode> = {
    0: (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand"><Rocket className="h-7 w-7" /></span>
        <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-ink-muted">
          Hi {session.user.name.split(' ')[0]}, let's set up <strong className="text-ink">{session.organization?.name}</strong>. It takes about two minutes and you can change everything later in Settings.
        </p>
        <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm">
          {['Describe your organization', 'Add your first data center', 'Choose how to start monitoring', 'Invite your team'].map((t) => (
            <li key={t} className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-ink"><Check className="h-4 w-4 text-brand" />{t}</li>
          ))}
        </ul>
        {!isOwner && <Callout tone="warning" className="mt-6 text-left">Only the organization owner can complete setup. You can skip and explore instead.</Callout>}
      </div>
    ),
    1: (
      <div className="space-y-5">
        <FormField label="Organization name" error={errors.name}>{(p) => <Input {...p} value={draft.organization.name} onChange={(e) => set('organization', { ...draft.organization, name: e.target.value })} />}</FormField>
        <FormField label="Company size" error={errors.size}>
          {(p) => (
            <Select {...p} value={draft.organization.size} onChange={(e) => set('organization', { ...draft.organization, size: e.target.value })}>
              <option value="">Select size</option>
              {sizes.map((s) => <option key={s} value={s}>{s} employees</option>)}
            </Select>
          )}
        </FormField>
        <FormField label="Industry or use case" error={errors.industry}>
          {(p) => (
            <Select {...p} value={draft.organization.industry} onChange={(e) => set('organization', { ...draft.organization, industry: e.target.value })}>
              <option value="">Select industry</option>
              {industries.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
        </FormField>
      </div>
    ),
    2: (
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Data center name" error={errors.dataCenterName} hint="For example DC1 - Mumbai">{(p) => <Input {...p} value={draft.infrastructure.dataCenterName} onChange={(e) => set('infrastructure', { ...draft.infrastructure, dataCenterName: e.target.value })} />}</FormField>
          <FormField label="Environment name" error={errors.environmentName}>{(p) => <Input {...p} value={draft.infrastructure.environmentName} onChange={(e) => set('infrastructure', { ...draft.infrastructure, environmentName: e.target.value })} />}</FormField>
        </div>
        <FormField label="Number of servers" error={errors.serverCount} hint="An estimate is fine.">{(p) => <Input {...p} type="number" min={1} inputMode="numeric" value={draft.infrastructure.serverCount} onChange={(e) => set('infrastructure', { ...draft.infrastructure, serverCount: e.target.value })} />}</FormField>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Environment type</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['cloud', 'Cloud', Cloud], ['on-premises', 'On-premises', Server], ['hybrid', 'Hybrid', Database]] as const).map(([id, label, Icon]) => (
              <label key={id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm', draft.infrastructure.environmentType === id ? 'border-brand bg-brand-50 text-ink' : 'border-line text-ink-muted hover:border-line-strong')}>
                <input type="radio" name="envType" className="sr-only" checked={draft.infrastructure.environmentType === id} onChange={() => set('infrastructure', { ...draft.infrastructure, environmentType: id })} />
                <Icon className="h-4 w-4" />{label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    ),
    3: (
      <fieldset className="space-y-3">
        <legend className="sr-only">Monitoring setup</legend>
        {([
          ['demo', FlaskConical, 'Demo environment', 'Explore with a realistic sample data center. Everything is labeled as sample data and you can replace it later.'],
          ['connect', Plug, 'Connect existing infrastructure', 'Start empty and stream metrics from agents, Prometheus or the ingestion API. You will get setup instructions in Integrations.'],
          ['later', Database, 'Configure an integration later', 'Start with an empty workspace. Incidents can still be created manually.'],
        ] as const).map(([id, Icon, title, text]) => (
          <label key={id} className={cn('flex cursor-pointer gap-3 rounded-xl border p-4', draft.monitoringMode === id ? 'border-brand bg-brand-50' : 'border-line hover:border-line-strong')}>
            <input type="radio" name="mode" className="mt-1 accent-[#16834A]" checked={draft.monitoringMode === id} onChange={() => set('monitoringMode', id)} />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon className="h-4 w-4 text-brand" />{title}</span>
              <span className="mt-1 block text-sm text-ink-muted">{text}</span>
            </span>
          </label>
        ))}
      </fieldset>
    ),
    4: (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">Invitations are sent when you finish setup and expire after 7 days. You can skip this and invite people later from Team.</p>
        {draft.invites.length === 0 && (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted"><Users className="mx-auto mb-2 h-5 w-5 text-ink-faint" />No teammates added yet.</div>
        )}
        {draft.invites.map((row, idx) => (
          <div key={idx}>
            <div className="flex gap-2">
              <Input
                aria-label={`Teammate ${idx + 1} email`}
                type="email"
                placeholder="name@company.com"
                invalid={!!errors[`invites.${idx}`]}
                value={row.email}
                onChange={(e) => set('invites', draft.invites.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))}
              />
              <Select aria-label={`Teammate ${idx + 1} role`} className="w-36 shrink-0" value={row.role} onChange={(e) => set('invites', draft.invites.map((r, i) => (i === idx ? { ...r, role: e.target.value as Draft['invites'][number]['role'] } : r)))}>
                {(['admin', 'engineer', 'viewer'] as const).map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
              </Select>
              <Button variant="ghost" size="icon" aria-label={`Remove teammate ${idx + 1}`} onClick={() => set('invites', draft.invites.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <FieldError>{errors[`invites.${idx}`]}</FieldError>
          </div>
        ))}
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={draft.invites.length >= 10} onClick={() => set('invites', [...draft.invites, { email: '', role: 'engineer' }])}>Add teammate</Button>
      </div>
    ),
    5: (
      <dl className="divide-y divide-line rounded-xl border border-line">
        {[
          ['Organization', `${draft.organization.name} · ${draft.organization.size} employees · ${draft.organization.industry}`, 1],
          ['Data center', `${draft.infrastructure.dataCenterName} · ${draft.infrastructure.environmentName}`, 2],
          ['Fleet', `${Number(draft.infrastructure.serverCount).toLocaleString()} servers · ${draft.infrastructure.environmentType}`, 2],
          ['Monitoring', { demo: 'Demo environment (sample data)', connect: 'Connect existing infrastructure', later: 'Configure later' }[draft.monitoringMode], 3],
          ['Invitations', draft.invites.length ? draft.invites.map((i) => `${i.email} (${roleLabels[i.role]})`).join(', ') : 'None', 4],
        ].map(([k, v, s]) => (
          <div key={k as string} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center">
            <dt className="w-32 shrink-0 text-sm text-ink-muted">{k}</dt>
            <dd className="flex-1 text-sm text-ink">{v}</dd>
            <button className="self-start text-xs font-medium text-brand hover:underline sm:self-center" onClick={() => go(s as number)}>Edit</button>
          </div>
        ))}
      </dl>
    ),
  };

  const titles = ['Welcome to VaultWatch', 'Tell us about your organization', 'Set up your infrastructure', 'Choose a monitoring setup', 'Invite team members', 'Review and finish'];
  const last = step === steps.length - 1;

  return (
    <div className="min-h-screen bg-canvas">
      <MockBanner />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Logo to="/onboarding" />
          <Button variant="ghost" size="sm" onClick={() => setConfirmSkip(true)} disabled={!!busy}>Skip Demo Setup</Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <nav aria-label="Onboarding progress">
          <p className="mb-2 text-xs font-medium text-ink-muted">Step {step + 1} of {steps.length}</p>
          <div className="h-1.5 rounded-full bg-line" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
            <div className="h-1.5 rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-4 hidden justify-between sm:flex">
            {steps.map((s, i) => (
              <li key={s} className={cn('flex items-center gap-1.5 text-xs', i === step ? 'font-semibold text-brand' : i < step ? 'text-ink' : 'text-ink-faint')}>
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', i < step ? 'bg-brand text-white' : i === step ? 'border-2 border-brand' : 'border border-line-strong')}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </nav>
        <div className="card mt-6 p-6 sm:p-8">
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none">{titles[step]}</h1>
          <div className="mt-6">{content[step]}</div>
          {serverError && <Callout tone="error" className="mt-6">{serverError}</Callout>}
          <div className="mt-8 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-between">
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => go(step - 1)} disabled={step === 0 || !!busy}>Back</Button>
            {last ? (
              <Button onClick={finish} loading={busy === 'finish'} disabled={!isOwner}>Finish setup</Button>
            ) : (
              <Button onClick={() => go(step + 1)} disabled={step === 0 && !isOwner}>{step === 0 ? 'Get started' : 'Continue'} <ArrowRight className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">Your progress is saved automatically.</p>
      </main>
      <ConfirmDialog
        open={confirmSkip}
        onClose={() => setConfirmSkip(false)}
        title="Skip setup for now?"
        description="You'll go straight to an empty dashboard. You can load the sample environment or connect infrastructure later from Integrations, and edit organization details in Settings."
        confirmLabel="Skip and go to dashboard"
        onConfirm={skip}
      />
    </div>
  );
}
