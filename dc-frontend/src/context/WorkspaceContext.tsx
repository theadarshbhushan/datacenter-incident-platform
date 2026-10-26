import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Alert, AlertRule, Incident, MonitoringSettings, NewIncidentInput, NotificationSettings, Role, Workspace } from '@/types/domain';
import { api } from '@/services/api';
import type { IncidentAction } from '@/services/types';
import { useAuth } from './AuthContext';

interface WorkspaceState {
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createIncident: (input: NewIncidentInput) => Promise<Incident>;
  updateIncident: (id: string, action: IncidentAction) => Promise<Incident>;
  updateAlert: (id: string, action: 'acknowledge' | 'dismiss') => Promise<Alert>;
  saveAlertRule: (rule: AlertRule) => Promise<AlertRule>;
  deleteAlertRule: (id: string) => Promise<void>;
  updateNotificationSettings: (s: NotificationSettings) => Promise<void>;
  updateMonitoring: (s: MonitoringSettings) => Promise<void>;
  inviteMember: (email: string, role: Role) => Promise<void>;
  changeMemberRole: (userId: string, role: Role) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  revokeInvitation: (id: string) => Promise<void>;
  resendInvitation: (id: string) => Promise<void>;
  memberName: (userId: string | null) => string;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

/**
 * Shared, org-scoped application state. Every mutation goes through the API layer and then updates
 * this single store, so dashboard cards, tables and reports always agree.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const orgId = session?.organization?.id;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) { setWorkspace(null); setLoading(false); return; }
    setLoading(true);
    try {
      setWorkspace(await api.getWorkspace());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workspace data.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const patch = (fn: (w: Workspace) => Workspace) => setWorkspace((w) => (w ? fn(w) : w));

  const value = useMemo<WorkspaceState>(() => ({
    workspace,
    loading,
    error,
    reload,
    async createIncident(input) {
      const inc = await api.createIncident(input);
      patch((w) => ({ ...w, incidents: [inc, ...w.incidents] }));
      return inc;
    },
    async updateIncident(id, action) {
      const inc = await api.updateIncident(id, action);
      patch((w) => ({ ...w, incidents: w.incidents.map((i) => (i.id === id ? inc : i)) }));
      return inc;
    },
    async updateAlert(id, action) {
      const a = await api.updateAlert(id, action);
      patch((w) => ({ ...w, alerts: w.alerts.map((x) => (x.id === id ? a : x)) }));
      return a;
    },
    async saveAlertRule(rule) {
      const r = await api.saveAlertRule(rule);
      patch((w) => ({ ...w, alertRules: w.alertRules.some((x) => x.id === r.id) ? w.alertRules.map((x) => (x.id === r.id ? r : x)) : [...w.alertRules, r] }));
      return r;
    },
    async deleteAlertRule(id) {
      await api.deleteAlertRule(id);
      patch((w) => ({ ...w, alertRules: w.alertRules.filter((x) => x.id !== id) }));
    },
    async updateNotificationSettings(s) {
      const n = await api.updateNotificationSettings(s);
      patch((w) => ({ ...w, notificationSettings: n }));
    },
    async updateMonitoring(s) {
      const m = await api.updateMonitoring(s);
      patch((w) => ({ ...w, monitoring: m }));
    },
    async inviteMember(email, role) {
      const inv = await api.inviteMember(email, role);
      patch((w) => ({ ...w, invitations: [...w.invitations, inv] }));
    },
    async changeMemberRole(userId, role) {
      const m = await api.changeMemberRole(userId, role);
      patch((w) => ({ ...w, members: w.members.map((x) => (x.userId === userId ? m : x)) }));
    },
    async removeMember(userId) {
      await api.removeMember(userId);
      patch((w) => ({
        ...w,
        members: w.members.filter((x) => x.userId !== userId),
        incidents: w.incidents.map((i) => (i.assigneeId === userId ? { ...i, assigneeId: null } : i)),
      }));
    },
    async revokeInvitation(id) {
      await api.revokeInvitation(id);
      patch((w) => ({ ...w, invitations: w.invitations.map((i) => (i.id === id ? { ...i, status: 'revoked' } : i)) }));
    },
    async resendInvitation(id) {
      await api.resendInvitation(id);
      await reload();
    },
    memberName(userId) {
      if (!userId) return 'Unassigned';
      return workspace?.members.find((m) => m.userId === userId)?.name ?? 'Former member';
    },
  }), [workspace, loading, error, reload]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
