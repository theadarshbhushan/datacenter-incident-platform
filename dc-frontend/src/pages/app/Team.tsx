import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailPlus, RefreshCw, ShieldCheck, Trash2, UserPlus, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Callout, Card, CardHeader, ConfirmDialog, Dialog, EmptyState, FormField, Input, Select, type Tone } from '@/components/ui';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { inviteSchema } from '@/schemas/forms';
import { ApiError, errorMessage } from '@/services/api';
import { assignableRoles, canManageMember, roleDescriptions, roleLabels } from '@/utils/permissions';
import { formatDate, timeAgo } from '@/utils/format';
import type { Invitation, Member, Role } from '@/types/domain';
import { isMock } from '@/config/env';

type InviteValues = z.infer<typeof inviteSchema>;
const statusTone: Record<Invitation['status'], Tone> = { pending: 'warning', accepted: 'healthy', declined: 'neutral', revoked: 'neutral', expired: 'critical' };

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { inviteMember } = useWorkspace();
  const { role } = useAuth();
  const toast = useToast();
  const roles = assignableRoles(role);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', role: 'engineer' } });
  const close = () => { reset(); onClose(); };
  const onSubmit = async (v: InviteValues) => {
    try {
      await inviteMember(v.email, v.role);
      toast.success('Invitation created', isMock ? `Demo mode: no email sent. The link is in the developer mailbox.` : `An invitation email was sent to ${v.email}.`);
      close();
    } catch (e) {
      if (e instanceof ApiError && e.fields?.email) setError('email', { message: e.fields.email });
      else setError('root', { message: errorMessage(e) });
    }
  };
  return (
    <Dialog open={open} onClose={close} title="Invite member" description="They'll receive a link that expires in 7 days."
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" form="invite-form" loading={isSubmitting}>Send invitation</Button></>}>
      <form id="invite-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {errors.root?.message && <Callout tone="error">{errors.root.message}</Callout>}
        <FormField label="Email address" error={errors.email?.message}>{(p) => <Input {...p} type="email" placeholder="name@company.com" {...register('email')} />}</FormField>
        <FormField label="Role" error={errors.role?.message} hint={role === 'admin' ? 'Admins can invite engineers and viewers.' : undefined}>
          {(p) => <Select {...p} {...register('role')}>{roles.map((r) => <option key={r} value={r}>{roleLabels[r]}: {roleDescriptions[r]}</option>)}</Select>}
        </FormField>
      </form>
    </Dialog>
  );
}

export default function Team() {
  const { workspace, changeMemberRole, removeMember, revokeInvitation, resendInvitation } = useWorkspace();
  const { session, role, can } = useAuth();
  const toast = useToast();
  const ws = workspace!;
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canManage = can('team:manage');
  const pending = ws.invitations.filter((i) => i.status === 'pending');
  const past = ws.invitations.filter((i) => i.status !== 'pending').slice(-10).reverse();

  const changeRole = async (m: Member, r: Role) => {
    setBusy(m.userId);
    try { await changeMemberRole(m.userId, r); toast.success('Role updated', `${m.name} is now ${roleLabels[r]}.`); } catch (e) { toast.error('Could not change role', errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <div>
      <PageHeader title="Team" description={`Members of ${session?.organization?.name}`} crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Team' }]}
        actions={canManage ? <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviting(true)}>Invite member</Button> : undefined} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Members" description={`${ws.members.length} people`} />
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {ws.members.map((m) => {
                const self = m.userId === session?.user.id;
                const manageable = canManage && !self && canManageMember(role, m.role);
                const options = assignableRoles(role);
                return (
                  <li key={m.userId} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={m.name} color={m.avatarColor} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{m.name}{self && <span className="ml-1.5 text-xs font-normal text-ink-muted">(you)</span>}</p>
                        <p className="truncate text-xs text-ink-muted">{m.email} · joined {formatDate(m.joinedAt)}{m.lastActive && ` · active ${timeAgo(m.lastActive)}`}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-11 sm:pl-0">
                      {manageable ? (
                        <Select aria-label={`Role for ${m.name}`} className="h-8 w-32 text-xs" value={m.role} disabled={busy === m.userId} onChange={(e) => changeRole(m, e.target.value as Role)}>
                          {[...new Set([m.role, ...options])].map((r) => <option key={r} value={r} disabled={!options.includes(r)}>{roleLabels[r]}</option>)}
                        </Select>
                      ) : (
                        <Badge tone={m.role === 'owner' ? 'healthy' : m.role === 'admin' ? 'violet' : 'neutral'}>{roleLabels[m.role]}</Badge>
                      )}
                      {manageable && <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)}><Trash2 className="h-4 w-4 text-critical" /></Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Invitations" description={`${pending.length} pending`} />
            {pending.length === 0 && past.length === 0 ? (
              <EmptyState icon={<MailPlus className="h-5 w-5" />} title="No invitations" description={canManage ? 'Invite teammates to collaborate on incidents.' : 'Owners and admins can invite teammates.'} />
            ) : (
              <div className="mt-3 overflow-x-auto border-t border-line">
                <table className="w-full min-w-[620px]">
                  <thead><tr className="border-b border-line bg-canvas/60"><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th><th className="th">Invited</th><th className="th">Expires</th><th className="th text-right">Actions</th></tr></thead>
                  <tbody>
                    {[...pending, ...past].map((i) => {
                      const expired = i.status === 'pending' && new Date(i.expiresAt).getTime() < Date.now();
                      return (
                        <tr key={i.id} className="border-b border-line last:border-0">
                          <td className="td">{i.email}</td>
                          <td className="td">{roleLabels[i.role]}</td>
                          <td className="td"><Badge tone={expired ? 'critical' : statusTone[i.status]}>{expired ? 'Expired' : i.status.charAt(0).toUpperCase() + i.status.slice(1)}</Badge></td>
                          <td className="td text-ink-muted">{timeAgo(i.createdAt)} by {i.invitedBy}</td>
                          <td className="td text-ink-muted">{i.status === 'pending' ? formatDate(i.expiresAt) : '—'}</td>
                          <td className="td text-right">
                            {i.status === 'pending' && canManage && (
                              <span className="inline-flex gap-1">
                                <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={busy === i.id}
                                  onClick={async () => { setBusy(i.id); try { await resendInvitation(i.id); toast.success('Invitation resent', isMock ? 'Demo mode: the new link is in the developer mailbox.' : undefined); } catch (e) { toast.error('Could not resend', errorMessage(e)); } finally { setBusy(null); } }}>Resend</Button>
                                <Button size="sm" variant="ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setRevoking(i)}>Revoke</Button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Roles" />
          <ul className="space-y-3 p-5">
            {(['owner', 'admin', 'engineer', 'viewer'] as Role[]).map((r) => (
              <li key={r} className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <div><p className="text-sm font-medium text-ink">{roleLabels[r]}{r === role && <span className="ml-1.5 text-xs font-normal text-brand">your role</span>}</p><p className="text-xs text-ink-muted">{roleDescriptions[r]}</p></div>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">Permissions are enforced by the server on every request, not only in this interface.</p>
        </Card>
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} destructive title="Remove member?" confirmLabel="Remove member" confirmText={removing?.email}
        description={<><strong className="text-ink">{removing?.name}</strong> will immediately lose access to {session?.organization?.name}. Incidents assigned to them become unassigned.</>}
        onConfirm={async () => { try { await removeMember(removing!.userId); toast.success('Member removed'); } catch (e) { toast.error('Could not remove member', errorMessage(e)); } }} />
      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} destructive title="Revoke invitation?" confirmLabel="Revoke"
        description={<>The invitation link sent to <strong className="text-ink">{revoking?.email}</strong> will stop working.</>}
        onConfirm={async () => { try { await revokeInvitation(revoking!.id); toast.success('Invitation revoked'); } catch (e) { toast.error('Could not revoke', errorMessage(e)); } }} />
    </div>
  );
}
