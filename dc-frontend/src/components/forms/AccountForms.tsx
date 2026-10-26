import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Laptop, LogOut } from 'lucide-react';
import { Avatar, Badge, Button, Callout, Card, CardHeader, FormField, Input, PasswordInput, PasswordStrengthMeter, Select, Spinner, Switch } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, ApiError, errorMessage } from '@/services/api';
import { changePasswordSchema, profileSchema } from '@/schemas/auth';
import type { UserPreferences, UserSession } from '@/types/domain';
import { timeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';

const colors = ['#16834A', '#2563EB', '#7C3AED', '#D97706', '#DB2777', '#0891B2'];

export function ProfileForm() {
  const { session, setSession } = useAuth();
  const toast = useToast();
  const user = session!.user;
  const [color, setColor] = useState(user.avatarColor);
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting, isDirty } } = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name, jobTitle: user.jobTitle ?? '' } });
  const onSubmit = async (v: z.infer<typeof profileSchema>) => {
    try {
      const u = await api.updateProfile({ name: v.name, jobTitle: v.jobTitle || '', avatarColor: color });
      setSession({ ...session!, user: u });
      toast.success('Profile updated');
    } catch (e) { setError('root', { message: errorMessage(e) }); }
  };
  return (
    <Card>
      <CardHeader title="Profile" description="How you appear to teammates." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 p-5">
        {errors.root?.message && <Callout tone="error">{errors.root.message}</Callout>}
        <div className="flex items-center gap-4">
          <Avatar name={watch('name') || user.name} color={color} size="lg" />
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Avatar color</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Avatar color">
              {colors.map((c) => <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-full ring-offset-2', color === c && 'ring-2 ring-ink')} style={{ backgroundColor: c }} />)}
            </div>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Full name" error={errors.name?.message}>{(p) => <Input {...p} autoComplete="name" {...register('name')} />}</FormField>
          <FormField label="Job title" optional error={errors.jobTitle?.message}>{(p) => <Input {...p} placeholder="e.g. NOC Lead" {...register('jobTitle')} />}</FormField>
        </div>
        <FormField label="Email" hint="Contact an owner to change the email on your account.">{(p) => <Input {...p} value={user.email} disabled readOnly />}</FormField>
        <div className="flex justify-end"><Button type="submit" loading={isSubmitting} disabled={!isDirty && color === user.avatarColor}>Save profile</Button></div>
      </form>
    </Card>
  );
}

export function PreferencesForm() {
  const { session, setSession } = useAuth();
  const toast = useToast();
  const [prefs, setPrefs] = useState<UserPreferences>(session!.user.preferences);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const u = await api.updateProfile({ preferences: prefs }); setSession({ ...session!, user: u }); toast.success('Preferences saved'); }
    catch (e) { toast.error('Could not save preferences', errorMessage(e)); } finally { setBusy(false); }
  };
  const zones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'];
  return (
    <Card>
      <CardHeader title="Preferences" />
      <div className="space-y-5 p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Time zone">{(p) => <Select {...p} value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}>{zones.map((z) => <option key={z}>{z}</option>)}</Select>}</FormField>
          <FormField label="Timestamps">{(p) => <Select {...p} value={prefs.dateFormat} onChange={(e) => setPrefs({ ...prefs, dateFormat: e.target.value as UserPreferences['dateFormat'] })}><option value="relative">Relative (5 min ago)</option><option value="absolute">Absolute (Oct 25, 14:32)</option></Select>}</FormField>
          <FormField label="Email digest">{(p) => <Select {...p} value={prefs.emailDigest} onChange={(e) => setPrefs({ ...prefs, emailDigest: e.target.value as UserPreferences['emailDigest'] })}><option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option></Select>}</FormField>
        </div>
        <Switch label="Compact tables" description="Show more rows with tighter spacing." checked={prefs.compactTables} onChange={(v) => setPrefs({ ...prefs, compactTables: v })} />
        <div className="flex justify-end"><Button onClick={save} loading={busy}>Save preferences</Button></div>
      </div>
    </Card>
  );
}

export function ChangePasswordForm() {
  const toast = useToast();
  type V = z.infer<typeof changePasswordSchema>;
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<V>({ resolver: zodResolver(changePasswordSchema), defaultValues: { current: '', next: '', confirm: '' } });
  const onSubmit = async (v: V) => {
    try {
      await api.changePassword(v.current, v.next);
      reset();
      toast.success('Password changed', 'Other sessions have been signed out.');
    } catch (e) {
      if (e instanceof ApiError && e.fields?.current) setError('current', { message: e.fields.current });
      else setError('root', { message: errorMessage(e) });
    }
  };
  return (
    <Card>
      <CardHeader title="Change password" description="Verified by the server. Other devices are signed out afterwards." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
        {errors.root?.message && <Callout tone="error">{errors.root.message}</Callout>}
        <FormField label="Current password" error={errors.current?.message}>{(p) => <PasswordInput {...p} autoComplete="current-password" {...register('current')} />}</FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="New password" error={errors.next?.message}>{(p) => <><PasswordInput {...p} autoComplete="new-password" {...register('next')} /><PasswordStrengthMeter password={watch('next')} /></>}</FormField>
          <FormField label="Confirm new password" error={errors.confirm?.message}>{(p) => <PasswordInput {...p} autoComplete="new-password" {...register('confirm')} />}</FormField>
        </div>
        <div className="flex justify-end"><Button type="submit" loading={isSubmitting}>Update password</Button></div>
      </form>
    </Card>
  );
}

export function SessionsList() {
  const toast = useToast();
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api.listSessions().then(setSessions).catch(() => setSessions([]));
  useEffect(() => { void load(); }, []);
  return (
    <Card>
      <CardHeader title="Active sessions" description="Devices signed in to your account." />
      <div className="p-5">
        {!sessions ? <Spinner /> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Laptop className="h-5 w-5 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{s.device} {s.current && <Badge tone="healthy" className="ml-1">This device</Badge>}</p>
                  <p className="text-xs text-ink-muted">{s.location} · signed in {timeAgo(s.createdAt)} · active {timeAgo(s.lastActive)}</p>
                </div>
                {!s.current && (
                  <Button size="sm" variant="ghost" loading={busy === s.id} icon={<LogOut className="h-3.5 w-3.5" />}
                    onClick={async () => { setBusy(s.id); try { await api.revokeSession(s.id); toast.success('Session signed out'); await load(); } catch (e) { toast.error('Could not sign out session', errorMessage(e)); } finally { setBusy(null); } }}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
