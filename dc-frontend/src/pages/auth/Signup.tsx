import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Callout, Checkbox, FormField, Input, PasswordInput, PasswordStrengthMeter } from '@/components/ui';
import { signupSchema, type SignupValues } from '@/schemas/auth';
import { useAuth } from '@/context/AuthContext';
import { ApiError, errorMessage } from '@/services/api';
import { planById } from '@/data/plans';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { PlanId } from '@/types/domain';
import { MailCheck } from 'lucide-react';
import { MockMailNotice } from './MockMailNotice';

export default function Signup() {
  useDocumentTitle('Create account');
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const planParam = params.get('plan');
  const plan = planParam === 'team' || planParam === 'business' || planParam === 'trial' ? planById(planParam as PlanId) : null;
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: params.get('email') ?? '', company: '', password: '', confirm: '', accept: false },
  });
  const password = watch('password');

  const onSubmit = async (v: SignupValues) => {
    setServerError(null);
    try {
      const r = await signup({ name: v.name, email: v.email, company: v.company, password: v.password, ref: params.get('ref') ?? undefined });
      if (r.session) navigate(r.verificationRequired ? '/verify-email' : '/onboarding', { replace: true });
      else setSentTo(v.email);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        Object.entries(e.fields).forEach(([k, msg]) => setError(k as keyof SignupValues, { message: msg }));
        if (!('email' in e.fields)) setServerError(e.message);
      } else {
        setServerError(errorMessage(e));
      }
    }
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={<>Already verified? <Link to="/login" className="font-medium text-brand hover:underline">Sign in</Link></>}>
        <div className="space-y-5">
          <div className="flex gap-3 rounded-lg border border-line bg-white p-4">
            <MailCheck className="h-5 w-5 shrink-0 text-brand" />
            <p className="text-sm text-ink-muted">
              We sent a message to <strong className="text-ink">{sentTo}</strong>. Open the link in it to verify your email, then sign in to set up your workspace.
              If you already have an account with this email, the message explains how to sign in.
            </p>
          </div>
          <MockMailNotice email={sentTo} />
          <p className="text-xs text-ink-faint">The link expires in 24 hours. Check your spam folder if it hasn't arrived after a few minutes.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={plan && plan.id !== 'trial' ? `Start with a 14-day trial, then continue on ${plan.name}.` : 'Start your 14-day free trial. No credit card required.'}
      footer={<>Already have an account? <Link to="/login" className="font-medium text-brand hover:underline">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && <Callout tone="error">{serverError}</Callout>}
        <FormField label="Full name" error={errors.name?.message}>{(p) => <Input {...p} autoComplete="name" autoFocus {...register('name')} />}</FormField>
        <FormField label="Work email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" placeholder="you@company.com" {...register('email')} />}
        </FormField>
        <FormField label="Company or organization" error={errors.company?.message}>{(p) => <Input {...p} autoComplete="organization" {...register('company')} />}</FormField>
        <FormField label="Password" error={errors.password?.message}>
          {(p) => (
            <>
              <PasswordInput {...p} autoComplete="new-password" {...register('password')} />
              <PasswordStrengthMeter password={password} />
            </>
          )}
        </FormField>
        <FormField label="Confirm password" error={errors.confirm?.message}>{(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}</FormField>
        <div>
          <Checkbox
            {...register('accept')}
            label={<>I agree to the <Link to="/terms" target="_blank" className="font-medium text-brand hover:underline">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="font-medium text-brand hover:underline">Privacy Policy</Link>.</>}
          />
          {errors.accept?.message && <p role="alert" className="mt-1.5 text-xs text-critical">{errors.accept.message}</p>}
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Create Account</Button>
      </form>
    </AuthLayout>
  );
}
