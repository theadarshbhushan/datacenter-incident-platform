import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageLoader, ButtonLink, EmptyState } from '@/components/ui';
import { homeFor, safeNext } from '@/utils/redirect';
import type { Permission } from '@/utils/permissions';

/** Requires a session. Unauthenticated visitors go to /login with their destination preserved. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-canvas"><PageLoader label="Checking your session…" /></div>;
  if (!session) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** App pages need a verified email, a finished (or skipped) onboarding and an organization. */
export function RequireReady({ children }: { children?: ReactNode }) {
  const { session } = useAuth();
  if (!session) return null;
  if (!session.user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (!session.user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  if (!session.organization) return <Navigate to="/onboarding" replace />;
  return <>{children ?? <Outlet />}</>;
}

/** Login/signup are for signed-out visitors; signed-in users are sent where they belong. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-canvas"><PageLoader /></div>;
  if (session) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={homeFor(session, safeNext(next))} replace />;
  }
  return <>{children}</>;
}

/** Frontend gate for role-restricted pages. The backend enforces the same rules on every request. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <Forbidden />;
  return <>{children}</>;
}

export function Forbidden() {
  return (
    <div className="card mx-auto mt-8 max-w-lg">
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" />}
        title="You don't have access to this page"
        description="Your role in this organization doesn't include this area. Ask an owner or admin if you need access."
        action={<ButtonLink to="/app/dashboard">Back to dashboard</ButtonLink>}
      />
    </div>
  );
}
