import { PageHeader } from '@/components/layout/PageHeader';
import { ChangePasswordForm, PreferencesForm, ProfileForm, SessionsList } from '@/components/forms/AccountForms';

export default function Profile() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Your profile" description="Manage your personal details, preferences and sign-in security." crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Profile' }]} />
      <div className="space-y-4">
        <ProfileForm />
        <PreferencesForm />
        <ChangePasswordForm />
        <SessionsList />
      </div>
    </div>
  );
}
