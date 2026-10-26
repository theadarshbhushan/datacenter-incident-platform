import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { z } from 'zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Callout, FormField, Input } from '@/components/ui';
import { forgotSchema } from '@/schemas/auth';
import { api, errorMessage } from '@/services/api';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { MockMailNotice } from './MockMailNotice';

const RESEND_SECONDS = 60;

export default function ForgotPassword() {
  useDocumentTitle('Forgot password');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resends, setResends] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (email: string) => {
    setError(null);
    try {
      await api.requestPasswordReset(email);
      setSentTo(email);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={<Link to="/login" className="inline-flex items-center gap-1 font-medium text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>}>
        <div className="space-y-5">
          <div className="flex gap-3 rounded-lg border border-healthy-line bg-healthy-bg p-4">
            <MailCheck className="h-5 w-5 shrink-0 text-brand" />
            <p className="text-sm text-ink">If an account exists for <strong>{sentTo}</strong>, we've sent a link to reset the password. The link expires in 30 minutes and works once.</p>
          </div>
          {error && <Callout tone="error">{error}</Callout>}
          <MockMailNotice email={sentTo} refreshKey={resends} />
          <div className="text-sm text-ink-muted">
            Didn't get it? Check spam, or{' '}
            <Button
              variant="link"
              disabled={cooldown > 0 || resending}
              onClick={async () => { setResending(true); await send(sentTo); setResends((r) => r + 1); setResending(false); }}
            >
              {cooldown > 0 ? `resend in ${cooldown}s` : resending ? 'sending…' : 'resend the link'}
            </Button>
            .
          </div>
          <button onClick={() => { setSentTo(null); setError(null); }} className="text-sm text-ink-muted hover:text-ink">Use a different email</button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter the email you use for VaultWatch and we'll send you a reset link."
      footer={<Link to="/login" className="inline-flex items-center gap-1 font-medium text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit((v) => send(v.email))} noValidate className="space-y-5">
        {error && <Callout tone="error">{error}</Callout>}
        <FormField label="Email address" error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" autoFocus {...register('email')} />}</FormField>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Send Reset Link</Button>
      </form>
    </AuthLayout>
  );
}
