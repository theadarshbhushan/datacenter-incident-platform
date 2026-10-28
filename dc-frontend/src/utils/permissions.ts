import type { Role } from '@/types/domain';

export type Permission =
  | 'org:manage'
  | 'billing:view'
  | 'billing:manage'
  | 'team:manage'
  | 'incident:write'
  | 'infra:manage'
  | 'alert:act'
  | 'predictions:run'
  | 'alertRules:manage'
  | 'monitoring:manage'
  | 'integrations:manage'
  | 'apiKeys:manage'
  | 'reports:export';

// Keep in sync with dc-backend/app/core/permissions.py — the backend is the source of truth.
const matrix: Record<Permission, Role[]> = {
  'org:manage': ['owner'],
  'billing:view': ['owner', 'admin'],
  'billing:manage': ['owner'],
  'team:manage': ['owner', 'admin'],
  'incident:write': ['owner', 'admin', 'engineer'],
  'infra:manage': ['owner', 'admin'],
  'alert:act': ['owner', 'admin', 'engineer'],
  'predictions:run': ['owner', 'admin', 'engineer'],
  'alertRules:manage': ['owner', 'admin'],
  'monitoring:manage': ['owner', 'admin'],
  'integrations:manage': ['owner', 'admin'],
  'apiKeys:manage': ['owner', 'admin'],
  'reports:export': ['owner', 'admin', 'engineer', 'viewer'],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return matrix[permission].includes(role);
}

export const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  engineer: 'Engineer',
  viewer: 'Viewer',
};

export const roleDescriptions: Record<Role, string> = {
  owner: 'Manages the organization, billing, team and every feature.',
  admin: 'Manages infrastructure, incidents, monitoring and members below admin.',
  engineer: 'Investigates, acknowledges and resolves incidents.',
  viewer: 'Read-only access to dashboards and reports.',
};

/** Roles that `actor` may grant. Owners can grant anything; admins can only grant engineer and viewer. */
export function assignableRoles(actor: Role | null | undefined): Role[] {
  if (actor === 'owner') return ['owner', 'admin', 'engineer', 'viewer'];
  if (actor === 'admin') return ['engineer', 'viewer'];
  return [];
}

export function canManageMember(actor: Role | null | undefined, target: Role): boolean {
  if (actor === 'owner') return true;
  if (actor === 'admin') return target === 'engineer' || target === 'viewer';
  return false;
}
