import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Callout, Checkbox, FormField, Input, PasswordInput } from '@/components/ui';
import { loginSchema, type LoginValues } from '@/schemas/auth';
import { useAuth } from '@/context/AuthContext';
import { errorMessage } from '@/services/api';
import { config, isMock } from '@/config/env';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/services/mockApi';
import { homeFor, safeNext } from '@/utils/redirect';
import { roleLabels } from '@/utils/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Login() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [serverError, setServerError] = useState<string | null>(params.get('reason') === 'expired' ? 'Your session expired. Please sign in again.' : null);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.get('email') ?? '', password: '', remember: false },
  });

  const onSubmit = async (v: LoginValues) => {
    setServerError(null);
    try {
      const s = await login(v);
      navigate(homeFor(s, next), { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    }
  };

  return (
    <AuthLayout
      title="Sign in to VaultWatch"
      subtitle="Welcome back. Enter your details to continue."
      footer={<>Don't have an account? <Link to={`/signup${params.toString() ? `?${params}` : ''}`} className="font-medium text-brand hover:underline">Create account</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {params.get('reset') === '1' && !serverError && <Callout tone="success">Your password was updated. Sign in with your new password.</Callout>}
        {serverError && <Callout tone="error">{serverError}</Callout>}
        <FormField label="Email address" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" autoFocus placeholder="you@company.com" {...register('email')} />}
        </FormField>
        <FormField label="Password" error={errors.password?.message} action={<Link to="/forgot-password" className="text-xs font-medium text-brand hover:underline">Forgot password?</Link>}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" {...register('password')} />}
        </FormField>
        <Checkbox label="Remember me on this device" {...register('remember')} />
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Sign In</Button>
        {config.googleAuthEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-ink-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            <a href={`${config.apiUrl}/api/v1/auth/google/start?next=${encodeURIComponent(next)}`} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm font-medium text-ink hover:bg-canvas">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5Z"/><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.8H1.8v3A11.5 11.5 0 0 0 12 23.5Z"/><path fill="#FBBC05" d="M5.6 14.1a6.9 6.9 0 0 1 0-4.3v-3H1.8a11.5 11.5 0 0 0 0 10.3l3.8-3Z"/><path fill="#EA4335" d="M12 4.7c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3C6.5 6.9 9 4.7 12 4.7Z"/></svg>
              Continue with Google
            </a>
          </>
        )}
      </form>
      {isMock && (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-white p-4">
          <p className="text-xs font-semibold text-ink">Demo accounts (mock mode only)</p>
          <p className="mt-0.5 text-xs text-ink-muted">Password for all: <code className="rounded bg-canvas px-1 font-mono">{DEMO_PASSWORD}</code>. Each has a different role.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => { setValue('email', a.email); setValue('password', DEMO_PASSWORD); }}
                className="rounded-md border border-line px-2.5 py-1.5 text-left text-xs hover:border-brand hover:bg-brand-50"
              >
                <span className="block font-medium text-ink">{roleLabels[a.role]}</span>
                <span className="block truncate text-ink-muted">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
