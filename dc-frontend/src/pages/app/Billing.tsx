import { useState } from 'react';
import { Check, CreditCard, FileText, Info } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, EmptyState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/services/api';
import { plans, planById, PRICING_IS_ILLUSTRATIVE, type Plan } from '@/data/plans';
import { config } from '@/config/env';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = Math.min(1, used / limit);
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-ink-muted">{label}</span><span className="font-medium text-ink">{used.toLocaleString()} / {limit.toLocaleString()}</span></div>
      <div className="mt-1.5 h-2 rounded-full bg-line"><div className={cn('h-2 rounded-full', ratio > 0.9 ? 'bg-critical' : ratio > 0.75 ? 'bg-warning' : 'bg-brand')} style={{ width: `${ratio * 100}%` }} /></div>
    </div>
  );
}

export default function Billing() {
  const { session, setSession, can } = useAuth();
  const { workspace } = useWorkspace();
  const toast = useToast();
  const org = session!.organization!;
  const plan = planById(org.plan);
  const [target, setTarget] = useState<Plan | null>(null);
  const ws = workspace!;
  const trialDays = Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000));
  const canManage = can('billing:manage');

  return (
    <div>
      <PageHeader title="Billing" description="Plan, usage and subscription" crumbs={[{ label: 'Settings', to: '/app/settings' }, { label: 'Billing' }]} />
      {!config.billingEnabled && (
        <Callout tone="warning" className="mb-5" title="Demo billing: no payment provider configured">
          Plan changes here update your organization's limits only. No card is charged and no invoice is created. Set up a provider such as Stripe on the backend and set VITE_BILLING_ENABLED=true to take payments.
          {PRICING_IS_ILLUSTRATIVE && ' Prices are illustrative.'}
        </Callout>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Current plan" action={<Badge tone={org.plan === 'trial' ? 'warning' : 'healthy'}>{org.plan === 'trial' ? `Trial · ${trialDays} days left` : 'Active (demo)'}</Badge>} />
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand"><CreditCard className="h-6 w-6" /></span>
            <div className="flex-1">
              <p className="text-lg font-semibold text-ink">{plan.name}</p>
              <p className="text-sm text-ink-muted">{plan.price ? `$${plan.price.toLocaleString()} ${plan.priceNote}` : `Free ${plan.priceNote}`}{org.plan === 'trial' && ` · ends ${formatDate(org.trialEndsAt)}`}</p>
            </div>
          </div>
          <div className="grid gap-5 border-t border-line p-5 sm:grid-cols-2">
            <Usage label="Servers" used={ws.servers.length} limit={plan.limits.servers} />
            <Usage label="Data centers" used={ws.dataCenters.length} limit={plan.limits.dataCenters} />
            <Usage label="Team members" used={ws.members.length + ws.invitations.filter((i) => i.status === 'pending').length} limit={plan.limits.members} />
            <Usage label="Alert rules" used={ws.alertRules.length} limit={org.plan === 'trial' ? 5 : 500} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Billing history" />
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No invoices" description={config.billingEnabled ? 'Invoices will appear here after your first payment.' : 'Billing history is available once a payment provider is connected.'} />
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-ink">Change plan</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === org.plan;
          const upgrade = plans.indexOf(p) > plans.indexOf(plan);
          return (
            <Card key={p.id} className={cn('flex flex-col p-5', current && 'border-brand')}>
              <div className="flex items-center justify-between"><p className="font-semibold text-ink">{p.name}</p>{current && <Badge tone="healthy">Current</Badge>}</div>
              <p className="mt-2 text-2xl font-bold text-ink">{p.price ? `$${p.price.toLocaleString()}` : '$0'}<span className="text-sm font-normal text-ink-muted"> {p.price ? '/mo' : '· 14 days'}</span></p>
              <ul className="mt-4 flex-1 space-y-1.5">{p.features.slice(0, 4).map((f) => <li key={f} className="flex gap-2 text-sm text-ink"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{f}</li>)}</ul>
              <Button className="mt-5" variant={upgrade ? 'primary' : 'secondary'} disabled={current || !canManage} onClick={() => setTarget(p)}>
                {current ? 'Current plan' : upgrade ? `Upgrade to ${p.name}` : `Downgrade to ${p.name}`}
              </Button>
            </Card>
          );
        })}
      </div>
      {!canManage && <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted"><Info className="h-3.5 w-3.5" /> Only the organization owner can change the plan.</p>}

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={`Switch to ${target?.name}?`}
        confirmLabel="Confirm change"
        description={<>Your limits change immediately. {config.billingEnabled ? 'Your payment method will be charged or credited on a prorated basis.' : <strong className="text-ink">This is a demo: no payment is taken.</strong>}</>}
        onConfirm={async () => {
          try { const o = await api.changePlan(target!.id); setSession({ ...session!, organization: o }); toast.success(`Plan changed to ${target!.name}`, config.billingEnabled ? undefined : 'Demo only. No charge was made.'); }
          catch (e) { toast.error('Could not change plan', errorMessage(e)); }
        }}
      />
    </div>
  );
}
