import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Clock, ShieldCheck, XCircle } from 'lucide-react';
import { z } from 'zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, ButtonLink, Callout, FormField, Input, PageLoader, PasswordInput, PasswordStrengthMeter } from '@/components/ui';
import { acceptInviteSchema } from '@/schemas/auth';
import { api, errorMessage } from '@/services/api';
import type { TokenState } from '@/services/types';
import type { InvitationDetails } from '@/types/domain';
import { useAuth } from '@/context/AuthContext';
import { roleDescriptions, roleLabels } from '@/utils/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type Values = z.infer<typeof acceptInviteSchema>;

export default function AcceptInvitation() {
  useDocumentTitle('Accept invitation');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { session, setSession, logout } = useAuth();
  const [details, setDetails] = useState<InvitationDetails | TokenState | 'loading'>('loading');
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(acceptInviteSchema), defaultValues: { name: '', password: '', confirm: '' } });

  useEffect(() => {
    if (!token) { setDetails('invalid'); return; }
    api.getInvitation(token).then(setDetails).catch(() => setDetails('invalid'));
  }, [token]);

  if (details === 'loading') return <AuthLayout title="Invitation"><PageLoader label="Checking your invitation…" /></AuthLayout>;

  if (declined) {
    return (
      <AuthLayout title="Invitation declined">
        <p className="text-sm text-ink-muted">You declined the invitation. The person who invited you can send a new one if you change your mind.</p>
        <ButtonLink to="/" variant="secondary" className="mt-6 w-full">Go to homepage</ButtonLink>
      </AuthLayout>
    );
  }

  if (typeof details === 'string') {
    const expired = details === 'expired';
    return (
      <AuthLayout title={expired ? 'This invitation has expired' : 'This invitation is no longer valid'}>
        <div className="space-y-5 text-center">
          {expired ? <Clock className="mx-auto h-12 w-12 text-warning" /> : <XCircle className="mx-auto h-12 w-12 text-critical" />}
          <p className="text-sm text-ink-muted">{expired ? 'Invitations are valid for 7 days.' : 'It may have been accepted, declined, revoked or replaced by a newer invitation.'} Ask an admin of the organization to send a new one.</p>
          <ButtonLink to={session ? '/app/dashboard' : '/login'} className="w-full">{session ? 'Go to dashboard' : 'Sign in'}</ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  const inv = details.invitation;
  const signedInAsInvitee = session?.user.email === inv.email;
  const signedInAsOther = session && !signedInAsInvitee;

  const accept = async (account?: { name: string; password: string }) => {
    setError(null); setBusy('accept');
    try {
      const s = await api.acceptInvitation(token, account);
      setSession(s);
      navigate('/app/dashboard', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally { setBusy(null); }
  };

  const decline = async () => {
    setError(null); setBusy('decline');
    try { await api.declineInvitation(token); setDeclined(true); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <AuthLayout title={`Join ${details.organizationName}`} subtitle={<>{details.inviterName} invited <strong className="text-ink">{inv.email}</strong> to collaborate on VaultWatch.</>}>
      <div className="space-y-5">
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand"><Building2 className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-semibold text-ink">{details.organizationName}</p>
              <p className="flex items-center gap-1 text-xs text-ink-muted"><ShieldCheck className="h-3.5 w-3.5" /> Role: {roleLabels[inv.role]}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-muted">{roleDescriptions[inv.role]}</p>
          <p className="mt-2 text-xs text-ink-faint">Expires {new Date(inv.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>

        {error && <Callout tone="error">{error}</Callout>}

        {signedInAsOther ? (
          <Callout tone="warning" title={`You're signed in as ${session.user.email}`}>
            This invitation is for {inv.email}. <button className="font-medium text-brand hover:underline" onClick={async () => { await logout(); }}>Sign out</button> and continue with the invited account.
          </Callout>
        ) : signedInAsInvitee ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" size="lg" loading={busy === 'accept'} onClick={() => accept()}>Accept invitation</Button>
            <Button variant="secondary" size="lg" loading={busy === 'decline'} onClick={decline}>Decline</Button>
          </div>
        ) : details.accountExists ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">You already have a VaultWatch account. Sign in to accept.</p>
            <ButtonLink to={`/login?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(`/accept-invitation?token=${token}`)}`} className="w-full" size="lg">Sign in to accept</ButtonLink>
            <Button variant="ghost" className="w-full" loading={busy === 'decline'} onClick={decline}>Decline invitation</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit((v) => accept({ name: v.name, password: v.password }))} noValidate className="space-y-4">
            <p className="text-sm font-medium text-ink">Create your account</p>
            <FormField label="Email">{(p) => <Input {...p} value={inv.email} disabled readOnly />}</FormField>
            <FormField label="Full name" error={errors.name?.message}>{(p) => <Input {...p} autoComplete="name" {...register('name')} />}</FormField>
            <FormField label="Password" error={errors.password?.message}>
              {(p) => (<><PasswordInput {...p} autoComplete="new-password" {...register('password')} /><PasswordStrengthMeter password={watch('password')} /></>)}
            </FormField>
            <FormField label="Confirm password" error={errors.confirm?.message}>{(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}</FormField>
            <p className="text-xs text-ink-muted">By accepting you agree to the <Link to="/terms" className="text-brand hover:underline">Terms</Link> and <Link to="/privacy" className="text-brand hover:underline">Privacy Policy</Link>.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" size="lg" loading={isSubmitting}>Accept and create account</Button>
              <Button variant="secondary" size="lg" loading={busy === 'decline'} onClick={decline}>Decline</Button>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
