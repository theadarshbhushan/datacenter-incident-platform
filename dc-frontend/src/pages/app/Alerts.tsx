import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bell, BellOff, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, Dialog, EmptyState, FormField, Input, Select, Switch, Tabs, alertTone } from '@/components/ui';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { alertRuleSchema } from '@/schemas/forms';
import { errorMessage } from '@/services/api';
import type { Alert, AlertRule, NotificationSettings } from '@/types/domain';
import { timeAgo, capitalize } from '@/utils/format';
import { isMock } from '@/config/env';

type Tab = 'active' | 'history' | 'rules' | 'notifications';
type RuleValues = z.infer<typeof alertRuleSchema>;
const metricUnits: Record<AlertRule['metric'], string> = { cpu: '%', memory: '%', storage: '%', temperature: '°C', power: ' W', latency: ' ms' };
const channels = ['email', 'slack', 'webhook', 'pagerduty'] as const;

function RuleDialog({ rule, onClose }: { rule: AlertRule | 'new' | null; onClose: () => void }) {
  const { saveAlertRule } = useWorkspace();
  const toast = useToast();
  const [chosen, setChosen] = useState<AlertRule['channels']>([]);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<RuleValues>({ resolver: zodResolver(alertRuleSchema) });
  useEffect(() => {
    if (!rule) return;
    const r = rule === 'new' ? { name: '', metric: 'cpu' as const, operator: '>' as const, threshold: 90, durationMin: 5, severity: 'warning' as const, channels: ['email' as const] } : rule;
    reset({ name: r.name, metric: r.metric, operator: r.operator, threshold: r.threshold, durationMin: r.durationMin, severity: r.severity });
    setChosen(r.channels);
  }, [rule, reset]);
  if (!rule) return null;
  const onSubmit = async (v: RuleValues) => {
    try {
      await saveAlertRule({ id: rule === 'new' ? '' : rule.id, enabled: rule === 'new' ? true : rule.enabled, channels: chosen, ...v });
      toast.success(rule === 'new' ? 'Alert rule created' : 'Alert rule saved');
      onClose();
    } catch (e) { setError('root', { message: errorMessage(e) }); }
  };
  return (
    <Dialog open onClose={onClose} title={rule === 'new' ? 'New alert rule' : 'Edit alert rule'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="rule-form" loading={isSubmitting}>Save rule</Button></>}>
      <form id="rule-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {errors.root?.message && <Callout tone="error">{errors.root.message}</Callout>}
        <FormField label="Rule name" error={errors.name?.message}>{(p) => <Input {...p} {...register('name')} />}</FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Metric" error={errors.metric?.message}>{(p) => <Select {...p} {...register('metric')}>{Object.keys(metricUnits).map((m) => <option key={m} value={m}>{capitalize(m)}</option>)}</Select>}</FormField>
          <FormField label="Condition" error={errors.operator?.message}>{(p) => <Select {...p} {...register('operator')}><option value=">">Above</option><option value="<">Below</option></Select>}</FormField>
          <FormField label="Threshold" error={errors.threshold?.message}>{(p) => <Input {...p} type="number" step="any" {...register('threshold')} />}</FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="For at least (minutes)" error={errors.durationMin?.message}>{(p) => <Input {...p} type="number" {...register('durationMin')} />}</FormField>
          <FormField label="Severity" error={errors.severity?.message}>{(p) => <Select {...p} {...register('severity')}><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></Select>}</FormField>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Notify via</legend>
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => {
              const on = chosen.includes(c);
              return <button type="button" key={c} aria-pressed={on} onClick={() => setChosen(on ? chosen.filter((x) => x !== c) : [...chosen, c])} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${on ? 'border-brand bg-brand-50 text-brand-800' : 'border-line text-ink-muted'}`}>{c === 'pagerduty' ? 'PagerDuty' : capitalize(c)}</button>;
            })}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

export function NotificationsForm() {
  const { workspace, updateNotificationSettings } = useWorkspace();
  const { can } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<NotificationSettings>(workspace!.notificationSettings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editable = can('alertRules:manage');
  const save = async () => {
    setErr(null);
    if (s.webhook && !/^https:\/\/[^\s]+$/.test(s.webhookUrl)) return setErr('Webhook URL must start with https://');
    if (s.slack && !/^#[\w-]{1,80}$/.test(s.slackChannel)) return setErr('Slack channel must look like #channel-name');
    setBusy(true);
    try { await updateNotificationSettings(s); toast.success('Notification settings saved'); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title="Notification configuration" description="Where alert notifications are delivered for this organization." />
      <div className="space-y-5 p-5">
        <Callout tone="info">Delivery requires channel credentials on the backend (SMTP, Slack app, PagerDuty key).{isMock && ' In demo mode settings are saved, but nothing is delivered.'}</Callout>
        <Switch label="Email" description="Send alerts to organization members by email." checked={s.email} onChange={(v) => setS({ ...s, email: v })} disabled={!editable} />
        <Switch label="Slack" description="Post alerts to a Slack channel." checked={s.slack} onChange={(v) => setS({ ...s, slack: v })} disabled={!editable} />
        {s.slack && <FormField label="Slack channel">{(p) => <Input {...p} value={s.slackChannel} onChange={(e) => setS({ ...s, slackChannel: e.target.value })} disabled={!editable} />}</FormField>}
        <Switch label="Webhook" description="POST a JSON payload to your endpoint." checked={s.webhook} onChange={(v) => setS({ ...s, webhook: v })} disabled={!editable} />
        {s.webhook && <FormField label="Webhook URL">{(p) => <Input {...p} placeholder="https://example.com/hooks/vaultwatch" value={s.webhookUrl} onChange={(e) => setS({ ...s, webhookUrl: e.target.value })} disabled={!editable} />}</FormField>}
        <Switch label="PagerDuty" description="Open PagerDuty incidents for critical alerts." checked={s.pagerduty} onChange={(v) => setS({ ...s, pagerduty: v })} disabled={!editable} />
        <Switch label="Quiet hours" description="Hold non-critical notifications between 22:00 and 07:00." checked={s.quietHours} onChange={(v) => setS({ ...s, quietHours: v })} disabled={!editable} />
        <FormField label="Minimum severity to notify">{(p) => <Select {...p} className="max-w-xs" value={s.minSeverity} onChange={(e) => setS({ ...s, minSeverity: e.target.value as NotificationSettings['minSeverity'] })} disabled={!editable}><option value="info">Info and above</option><option value="warning">Warning and above</option><option value="critical">Critical only</option></Select>}</FormField>
        {err && <Callout tone="error">{err}</Callout>}
        {editable ? <div className="flex justify-end"><Button onClick={save} loading={busy}>Save changes</Button></div> : <p className="text-xs text-ink-muted">Only owners and admins can change notification settings.</p>}
      </div>
    </Card>
  );
}

export default function Alerts() {
  const { workspace, updateAlert, saveAlertRule, deleteAlertRule } = useWorkspace();
  const { can } = useAuth();
  const toast = useToast();
  const ws = workspace!;
  const [tab, setTab] = useState<Tab>('active');
  const [editing, setEditing] = useState<AlertRule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const [sev, setSev] = useState('');
  const canAct = can('alert:act');
  const canRules = can('alertRules:manage');

  const active = ws.alerts.filter((a) => a.status === 'active' && (!sev || a.severity === sev));
  const history = ws.alerts.filter((a) => a.status !== 'active' && (!sev || a.severity === sev));
  const host = (id: string | null) => (id ? ws.servers.find((s) => s.id === id)?.hostname ?? '—' : '—');

  const act = async (a: Alert, action: 'acknowledge' | 'dismiss') => {
    try { await updateAlert(a.id, action); toast.success(action === 'acknowledge' ? 'Alert acknowledged' : 'Alert dismissed'); } catch (e) { toast.error('Action failed', errorMessage(e)); }
  };

  const AlertRow = ({ a }: { a: Alert }) => (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.severity === 'critical' ? 'bg-critical-bg text-critical' : a.severity === 'warning' ? 'bg-warning-bg text-warning' : 'bg-info-bg text-info'}`}><Bell className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-ink">{a.title}</p><Badge tone={alertTone[a.severity]}>{capitalize(a.severity)}</Badge>{a.status !== 'active' && <Badge>{capitalize(a.status)}</Badge>}</div>
        <p className="mt-0.5 text-sm text-ink-muted">{a.message} · <span className="font-mono text-xs">{host(a.serverId)}</span> · {timeAgo(a.createdAt)}{a.acknowledgedBy && ` · by ${a.acknowledgedBy}`}</p>
      </div>
      {a.status === 'active' && canAct && (
        <div className="flex gap-2 pl-12 sm:pl-0">
          <Button size="sm" variant="secondary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => act(a, 'acknowledge')}>Acknowledge</Button>
          <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => act(a, 'dismiss')}>Dismiss</Button>
        </div>
      )}
    </li>
  );

  return (
    <div>
      <PageHeader title="Alerts" description="Active and historical alerts, alert rules and notification settings" crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Alerts' }]}
        actions={tab === 'rules' && canRules ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New rule</Button> : undefined} />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { id: 'active', label: 'Active', count: ws.alerts.filter((a) => a.status === 'active').length },
        { id: 'history', label: 'History' },
        { id: 'rules', label: 'Rules & thresholds', count: ws.alertRules.length },
        { id: 'notifications', label: 'Notifications' },
      ]} />

      {(tab === 'active' || tab === 'history') && (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <p className="text-sm text-ink-muted">{tab === 'active' ? `${active.length} active alerts` : `${history.length} past alerts`}</p>
            <Select aria-label="Severity" className="w-40" value={sev} onChange={(e) => setSev(e.target.value)}><option value="">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></Select>
          </div>
          {(tab === 'active' ? active : history).length === 0 ? (
            <EmptyState icon={<BellOff className="h-5 w-5" />} title={tab === 'active' ? 'No active alerts' : 'No alert history'} description={tab === 'active' ? 'Everything is quiet right now.' : 'Acknowledged and dismissed alerts will appear here.'} />
          ) : (
            <ul className="divide-y divide-line">{(tab === 'active' ? active : history).map((a) => <AlertRow key={a.id} a={a} />)}</ul>
          )}
        </Card>
      )}

      {tab === 'rules' && (
        <Card>
          {ws.alertRules.length === 0 ? <EmptyState title="No alert rules" description="Create a rule to be notified when a metric crosses a threshold." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead><tr className="border-b border-line bg-canvas/60"><th className="th">Rule</th><th className="th">Condition</th><th className="th">Severity</th><th className="th">Channels</th><th className="th">Enabled</th><th className="th text-right">Actions</th></tr></thead>
                <tbody>
                  {ws.alertRules.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="td font-medium">{r.name}</td>
                      <td className="td text-ink-muted">{capitalize(r.metric)} {r.operator === '>' ? 'above' : 'below'} <span className="font-medium text-ink">{r.threshold}{metricUnits[r.metric]}</span> for {r.durationMin} min</td>
                      <td className="td"><Badge tone={alertTone[r.severity]}>{capitalize(r.severity)}</Badge></td>
                      <td className="td text-ink-muted">{r.channels.map((c) => (c === 'pagerduty' ? 'PagerDuty' : capitalize(c))).join(', ') || '—'}</td>
                      <td className="td">
                        <button role="switch" aria-checked={r.enabled} aria-label={`Enable ${r.name}`} disabled={!canRules}
                          onClick={async () => { try { await saveAlertRule({ ...r, enabled: !r.enabled }); } catch (e) { toast.error('Could not update rule', errorMessage(e)); } }}
                          className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${r.enabled ? 'bg-brand' : 'bg-line-strong'}`}>
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${r.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                      <td className="td text-right">
                        {canRules && (
                          <span className="inline-flex gap-1">
                            <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-critical" /></Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!canRules && <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">Only owners and admins can change alert rules.</p>}
        </Card>
      )}

      {tab === 'notifications' && <NotificationsForm />}

      <RuleDialog rule={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} destructive title="Delete alert rule?" confirmLabel="Delete rule"
        description={<>The rule <strong className="text-ink">{deleting?.name}</strong> will stop generating alerts. Existing alerts are kept.</>}
        onConfirm={async () => { try { await deleteAlertRule(deleting!.id); toast.success('Alert rule deleted'); } catch (e) { toast.error('Could not delete rule', errorMessage(e)); } }} />
    </div>
  );
}
