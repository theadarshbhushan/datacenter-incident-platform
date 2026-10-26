import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { z } from 'zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, ButtonLink, Callout, FormField, PageLoader, PasswordInput, PasswordStrengthMeter } from '@/components/ui';
import { resetSchema } from '@/schemas/auth';
import { api, ApiError, errorMessage } from '@/services/api';
import type { TokenState } from '@/services/types';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type Values = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  useDocumentTitle('Reset password');
  const [params] = useSearchParams();
  const { setSession } = useAuth();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<TokenState | 'checking' | 'done'>('checking');
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.checkResetToken(token).then(setState).catch(() => setState('invalid'));
  }, [token]);

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await api.resetPassword(token, v.password);
      setSession(null);
      setState('done');
    } catch (e) {
      if (e instanceof ApiError && e.code.startsWith('token_')) setState(e.code === 'token_expired' ? 'expired' : 'invalid');
      else setError(errorMessage(e));
    }
  };

  if (state === 'checking') return <AuthLayout title="Reset your password"><PageLoader label="Checking your link…" /></AuthLayout>;

  if (state === 'done') {
    return (
      <AuthLayout title="Password updated">
        <div className="space-y-5 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-brand" />
          <p className="text-sm text-ink-muted">Your password has been changed and you've been signed out of all devices.</p>
          <ButtonLink to="/login?reset=1" className="w-full" size="lg">Continue to sign in</ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  if (state !== 'valid') {
    const expired = state === 'expired';
    return (
      <AuthLayout title={expired ? 'This link has expired' : 'This link is not valid'}>
        <div className="space-y-5 text-center">
          {expired ? <Clock className="mx-auto h-12 w-12 text-warning" /> : <XCircle className="mx-auto h-12 w-12 text-critical" />}
          <p className="text-sm text-ink-muted">
            {expired ? 'Password reset links expire after 30 minutes for your security.' : 'The link may be incomplete, already used, or replaced by a newer one.'} Request a new link to continue.
          </p>
          <ButtonLink to="/forgot-password" className="w-full" size="lg">Request a new link</ButtonLink>
          <Link to="/login" className="block text-sm font-medium text-brand hover:underline">Back to sign in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Use at least 10 characters with upper and lower case letters and a number.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {error && <Callout tone="error">{error}</Callout>}
        <FormField label="New password" error={errors.password?.message}>
          {(p) => (<><PasswordInput {...p} autoComplete="new-password" autoFocus {...register('password')} /><PasswordStrengthMeter password={watch('password')} /></>)}
        </FormField>
        <FormField label="Confirm new password" error={errors.confirm?.message}>{(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}</FormField>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
