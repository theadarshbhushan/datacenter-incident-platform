import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role, Session } from '@/types/domain';
import { api } from '@/services/api';
import { SESSION_EXPIRED_EVENT, type LoginInput, type SignupInput } from '@/services/types';
import { can, type Permission } from '@/utils/permissions';

interface AuthState {
  session: Session | null;
  loading: boolean;
  role: Role | null;
  can: (p: Permission) => boolean;
  refresh: () => Promise<Session | null>;
  setSession: (s: Session | null) => void;
  login: (input: LoginInput) => Promise<Session>;
  signup: (input: SignupInput) => Promise<{ session: Session | null; verificationRequired: boolean }>;
  logout: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getSession();
      setSession(s);
      return s;
    } catch {
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // The server rejected the session (expired, revoked, or signed out elsewhere): drop it so the
  // route guards send the user to /login with their current page as `next`.
  useEffect(() => {
    const onExpired = () => setSession(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const value = useMemo<AuthState>(() => ({
    session,
    loading,
    role: session?.role ?? null,
    can: (p) => can(session?.role, p),
    refresh,
    setSession,
    async login(input) {
      const s = await api.login(input);
      setSession(s);
      return s;
    },
    async signup(input) {
      const r = await api.signup(input);
      if (r.session) setSession(r.session);
      return r;
    },
    async logout() {
      try { await api.logout(); } finally { setSession(null); }
    },
    async switchOrganization(orgId) {
      const s = await api.switchOrganization(orgId);
      setSession(s);
    },
  }), [session, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
