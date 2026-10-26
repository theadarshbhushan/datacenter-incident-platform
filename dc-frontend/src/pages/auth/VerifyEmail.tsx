import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, MailWarning, XCircle } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, ButtonLink, Callout, PageLoader } from '@/components/ui';
import { api, errorMessage } from '@/services/api';
import type { VerifyResult } from '@/services/types';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { MockMailNotice } from './MockMailNotice';

export default function VerifyEmail() {
  useDocumentTitle('Verify email');
  const [params] = useSearchParams();
  const token = params.get('token');
  const { session, refresh, loading } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<VerifyResult | 'checking' | null>(token ? 'checking' : null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(0);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api.verifyEmail(token)
      .then(async (r) => { setResult(r); if (r === 'verified' || r === 'already-verified') await refresh(); })
      .catch(() => setResult('invalid'));
  }, [token, refresh]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setSending(true); setMsg(null);
    try {
      await api.resendVerification(session?.user.email);
      setMsg({ tone: 'success', text: 'If your email still needs verifying, a new link is on its way.' });
      setCooldown(60); setSent((n) => n + 1);
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally { setSending(false); }
  };

  const resendBlock = (
    <div className="space-y-3">
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
      {session ? (
        <Button variant="secondary" className="w-full" onClick={resend} loading={sending} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
        </Button>
      ) : (
        <ButtonLink to="/login?next=/verify-email" variant="secondary" className="w-full">Sign in to resend the link</ButtonLink>
      )}
    </div>
  );

  if (loading || result === 'checking') return <AuthLayout title="Verifying your email"><PageLoader label="Checking your link…" /></AuthLayout>;

  if (result === 'verified' || result === 'already-verified' || (!token && session?.user.emailVerified)) {
    const next = session && !session.user.onboardingCompleted ? '/onboarding' : session ? '/app/dashboard' : '/login';
    return (
      <AuthLayout title={result === 'verified' ? 'Email verified' : 'Email already verified'}>
        <div className="space-y-5 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-brand" />
          <p className="text-sm text-ink-muted">Your email address is confirmed. {session ? "Let's finish setting up your workspace." : 'Sign in to continue.'}</p>
          <Button className="w-full" size="lg" onClick={() => navigate(next)}>{session && !session.user.onboardingCompleted ? 'Continue to onboarding' : 'Continue'}</Button>
        </div>
      </AuthLayout>
    );
  }

  if (result === 'expired' || result === 'invalid') {
    return (
      <AuthLayout title={result === 'expired' ? 'Verification link expired' : 'Verification link not valid'}>
        <div className="space-y-5 text-center">
          {result === 'expired' ? <Clock className="mx-auto h-12 w-12 text-warning" /> : <XCircle className="mx-auto h-12 w-12 text-critical" />}
          <p className="text-sm text-ink-muted">{result === 'expired' ? 'Verification links expire after 24 hours.' : 'This link is incomplete or has been replaced by a newer one.'} Request a new link below.</p>
          {resendBlock}
          {session && <MockMailNotice email={session.user.email} refreshKey={sent} />}
        </div>
      </AuthLayout>
    );
  }

  // No token: waiting for the user to click the emailed link.
  return (
    <AuthLayout
      title="Verify your email"
      subtitle={session ? <>We sent a verification link to <strong className="text-ink">{session.user.email}</strong>. Click it to activate your account.</> : 'Open the verification link from your email to activate your account.'}
      footer={session ? <>Wrong email? <Link to="/logout" className="font-medium text-brand hover:underline">Sign out</Link> and create a new account.</> : <Link to="/login" className="font-medium text-brand hover:underline">Back to sign in</Link>}
    >
      <div className="space-y-5">
        <div className="flex gap-3 rounded-lg border border-line bg-white p-4">
          <MailWarning className="h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm text-ink-muted">The link expires in 24 hours. Check your spam folder if it hasn't arrived after a few minutes.</p>
        </div>
        {session && <MockMailNotice email={session.user.email} refreshKey={sent} />}
        {resendBlock}
      </div>
    </AuthLayout>
  );
}
