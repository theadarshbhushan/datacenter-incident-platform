import { Compass } from 'lucide-react';
import { ButtonLink, Logo } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFound({ inApp, title = 'Page not found', message = "The page you're looking for doesn't exist or has moved." }: { inApp?: boolean; title?: string; message?: string }) {
  useDocumentTitle(title);
  const { session } = useAuth();
  const body = (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand"><Compass className="h-7 w-7" /></span>
      <p className="mt-5 font-mono text-sm font-semibold text-brand">404</p>
      <h1 className="mt-1 text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {session ? <ButtonLink to="/app/dashboard">Return to dashboard</ButtonLink> : <ButtonLink to="/">Return home</ButtonLink>}
        {inApp ? <ButtonLink to="/app/incidents" variant="secondary">View incidents</ButtonLink> : <ButtonLink to="/documentation" variant="secondary">Documentation</ButtonLink>}
      </div>
    </div>
  );
  if (inApp) return body;
  return (
    <div className="min-h-screen bg-canvas">
      <header className="container-page flex h-16 items-center"><Logo /></header>
      {body}
    </div>
  );
}
