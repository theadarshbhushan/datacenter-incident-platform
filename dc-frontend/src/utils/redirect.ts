import type { Session } from '@/types/domain';

/** Only allow same-origin, path-only redirects to avoid open-redirect issues. */
export function safeNext(next: string | null | undefined, fallback = '/app/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (next.startsWith('/login') || next.startsWith('/signup') || next.startsWith('/logout')) return fallback;
  return next;
}

/** Where a signed-in user belongs right now, given verification and onboarding state. */
export function homeFor(session: Session, next?: string | null): string {
  if (!session.user.emailVerified) return '/verify-email';
  if (!session.user.onboardingCompleted) return '/onboarding';
  return safeNext(next);
}
