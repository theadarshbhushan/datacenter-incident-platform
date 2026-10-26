import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Mail, MessageSquare } from 'lucide-react';
import { MarketingLayout, PageHero } from '@/components/layout/MarketingLayout';
import { Button, Callout, FormField, Input, Select, Textarea } from '@/components/ui';
import { contactSchema, type ContactValues } from '@/schemas/forms';
import { api, errorMessage } from '@/services/api';
import { config } from '@/config/env';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const subjects = [
  { id: 'sales', label: 'Sales and pricing' },
  { id: 'demo', label: 'Request a walkthrough' },
  { id: 'support', label: 'Product support' },
  { id: 'security', label: 'Security question' },
  { id: 'other', label: 'Something else' },
];

export default function Contact() {
  useDocumentTitle('Contact');
  const [params] = useSearchParams();
  const initial = subjects.some((s) => s.id === params.get('subject')) ? params.get('subject')! : '';
  const [result, setResult] = useState<{ delivered: boolean } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', company: '', subject: initial, message: '' },
  });

  const onSubmit = async (v: ContactValues) => {
    setServerError(null);
    try {
      setResult(await api.submitContact(v));
      reset();
    } catch (e) {
      setServerError(errorMessage(e));
    }
  };

  return (
    <MarketingLayout>
      <PageHero eyebrow="Contact" title="Talk to the VaultWatch team" description="Questions about pricing, a walkthrough for your team or help with your account. We usually reply within one business day." />
      <div className="container-page grid gap-8 py-16 lg:grid-cols-3">
        <aside className="space-y-4">
          <div className="card p-5">
            <Mail className="h-5 w-5 text-brand" />
            <p className="mt-3 text-sm font-semibold text-ink">Email</p>
            <a href={`mailto:${config.supportEmail}`} className="text-sm text-brand hover:underline">{config.supportEmail}</a>
            <p className="mt-2 text-xs text-ink-faint">Placeholder address. Replace with your real support inbox before launch.</p>
          </div>
          <div className="card p-5">
            <MessageSquare className="h-5 w-5 text-brand" />
            <p className="mt-3 text-sm font-semibold text-ink">Existing customers</p>
            <p className="text-sm text-ink-muted">Sign in and use the Documentation or contact your account owner.</p>
          </div>
        </aside>
        <div className="card p-6 sm:p-8 lg:col-span-2">
          {result ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-brand" />
              <h2 className="mt-4 text-lg font-semibold text-ink">{result.delivered ? 'Thanks, your message was sent' : 'Message received in demo mode'}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
                {result.delivered
                  ? 'Our team will get back to you at the email you provided.'
                  : 'This environment has no email delivery configured, so your message was validated but not forwarded to anyone. Configure SMTP in the backend to receive contact requests.'}
              </p>
              <Button variant="secondary" className="mt-6" onClick={() => setResult(null)}>Send another message</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {serverError && <Callout tone="error">{serverError}</Callout>}
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Name" error={errors.name?.message}>{(p) => <Input {...p} autoComplete="name" {...register('name')} />}</FormField>
                <FormField label="Work email" error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}</FormField>
                <FormField label="Company" error={errors.company?.message}>{(p) => <Input {...p} autoComplete="organization" {...register('company')} />}</FormField>
                <FormField label="Subject" error={errors.subject?.message}>
                  {(p) => (
                    <Select {...p} {...register('subject')}>
                      <option value="">Choose a subject</option>
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </Select>
                  )}
                </FormField>
              </div>
              <FormField label="Message" error={errors.message?.message}>{(p) => <Textarea {...p} rows={6} {...register('message')} />}</FormField>
              <div className="flex flex-col-reverse items-start justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-xs text-ink-muted">By sending this form you agree to our <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>.</p>
                <Button type="submit" loading={isSubmitting}>Send message</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
