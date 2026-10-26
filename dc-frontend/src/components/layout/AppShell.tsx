import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, BrainCircuit, Building2, Check, ChevronDown, ChevronsUpDown, CreditCard, LayoutDashboard, LogOut, Menu as MenuIcon,
  Plug, Search, Server, Settings, Siren, User as UserIcon, Users, X,
} from 'lucide-react';
import { Avatar, Badge, LogoMark, Spinner, alertTone } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDebounce } from '@/hooks/useDebounce';
import { roleLabels, type Permission } from '@/utils/permissions';
import { timeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';
import { MockBanner } from './MockBanner';

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; permission?: Permission }

const primaryNav: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/incidents', label: 'Incidents', icon: Siren },
  { to: '/app/predictions', label: 'Prediction', icon: BrainCircuit },
  { to: '/app/infrastructure', label: 'Infrastructure', icon: Server },
  { to: '/app/reports', label: 'Reports', icon: BarChart3 },
  { to: '/app/alerts', label: 'Alerts', icon: Bell },
];
const secondaryNav: NavItem[] = [
  { to: '/app/team', label: 'Team', icon: Users },
  { to: '/app/integrations', label: 'Integrations', icon: Plug, permission: 'integrations:manage' },
  { to: '/app/billing', label: 'Billing', icon: CreditCard, permission: 'billing:view' },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { can } = useAuth();
  return (
    <ul className="space-y-0.5">
      {items.filter((i) => !i.permission || can(i.permission)).map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-100 text-brand-800' : 'text-ink-muted hover:bg-brand-50 hover:text-ink',
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function OrgSwitcher() {
  const { session, switchOrganization } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false), open);
  if (!session?.organization) return null;
  const orgs = session.organizations;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => orgs.length > 1 && setOpen((o) => !o)}
        className={cn('flex w-full items-center gap-2.5 rounded-lg border border-line bg-white px-2.5 py-2 text-left', orgs.length > 1 && 'hover:border-line-strong')}
        aria-haspopup={orgs.length > 1 ? 'listbox' : undefined}
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand"><Building2 className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{session.organization.name}</span>
          <span className="block text-[11px] text-ink-muted">{roleLabels[session.role!]}</span>
        </span>
        {orgs.length > 1 && <ChevronsUpDown className="h-4 w-4 text-ink-faint" aria-hidden />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-line bg-white py-1 shadow-pop" role="listbox">
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Switch organization</p>
          {orgs.map((o) => (
            <button
              key={o.id}
              role="option"
              aria-selected={o.id === session.organization!.id}
              onClick={async () => {
                if (o.id === session.organization!.id) return setOpen(false);
                setBusy(o.id);
                try { await switchOrganization(o.id); navigate('/app/dashboard'); } finally { setBusy(null); setOpen(false); }
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{o.name}</span>
                <span className="text-[11px] text-ink-muted">{roleLabels[o.role]}</span>
              </span>
              {busy === o.id ? <Spinner className="h-4 w-4" /> : o.id === session.organization!.id && <Check className="h-4 w-4 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Link to="/app/dashboard" onClick={onNavigate} className="flex items-center gap-2 px-5 pb-4 pt-5 font-semibold text-ink">
        <LogoMark />
        <span className="text-[17px] tracking-tight">VaultWatch</span>
      </Link>
      <div className="px-3 pb-3"><OrgSwitcher /></div>
      <nav className="flex-1 overflow-y-auto px-3" aria-label="Application">
        <NavList items={primaryNav} onNavigate={onNavigate} />
        <p className="mb-1.5 mt-6 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Workspace</p>
        <NavList items={secondaryNav} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-line p-3">
        <Link to="/app/profile" onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-brand-50">
          <SidebarUser />
        </Link>
      </div>
    </div>
  );
}

function SidebarUser() {
  const { session } = useAuth();
  if (!session) return null;
  return (
    <>
      <Avatar name={session.user.name} color={session.user.avatarColor} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{session.user.name}</span>
        <span className="block truncate text-[11px] text-ink-muted">{session.user.email}</span>
      </span>
    </>
  );
}

function GlobalSearch() {
  const { workspace } = useWorkspace();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false), open);
  const dq = useDebounce(q.trim().toLowerCase(), 120);
  const results = useMemo(() => {
    if (!workspace || dq.length < 2) return [];
    const out: { label: string; sub: string; to: string; kind: string }[] = [];
    workspace.incidents.filter((i) => i.id.toLowerCase().includes(dq) || i.title.toLowerCase().includes(dq)).slice(0, 5)
      .forEach((i) => out.push({ kind: 'Incident', label: i.title, sub: i.id, to: `/app/incidents/${i.id}` }));
    workspace.servers.filter((s) => s.hostname.includes(dq) || s.ip.includes(dq) || s.role.toLowerCase().includes(dq)).slice(0, 5)
      .forEach((s) => out.push({ kind: 'Server', label: s.hostname, sub: `${s.role} · ${s.ip}`, to: `/app/infrastructure?server=${s.id}` }));
    workspace.racks.filter((r) => `rack ${r.label}`.toLowerCase().includes(dq) || r.label.toLowerCase().includes(dq)).slice(0, 4)
      .forEach((r) => out.push({ kind: 'Rack', label: `Rack ${r.label}`, sub: workspace.dataCenters.find((d) => d.id === r.dcId)?.name ?? '', to: `/app/infrastructure?rack=${r.id}` }));
    return out;
  }, [workspace, dq]);
  const go = (to: string) => { setOpen(false); setQ(''); navigate(to); };
  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].to); }}
        placeholder="Search servers, incidents, racks…"
        className="h-10 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/15"
        aria-label="Search servers, incidents and racks"
        role="combobox"
        aria-expanded={open && dq.length >= 2}
        aria-controls="global-search-results"
      />
      {open && dq.length >= 2 && (
        <div id="global-search-results" className="absolute left-0 right-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-pop" role="listbox">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">No matches for “{q}”.</p>
          ) : results.map((r) => (
            <button key={r.kind + r.to} role="option" aria-selected={false} onClick={() => go(r.to)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas">
              <Badge tone="neutral" className="w-16 justify-center">{r.kind}</Badge>
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{r.label}</span>
                <span className="block truncate text-xs text-ink-muted">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const active = (workspace?.alerts ?? []).filter((a) => a.status === 'active');
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-ink" aria-label={`Notifications, ${active.length} active`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {active.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical ring-2 ring-white" />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(92vw,360px)] rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <Badge tone={active.length ? 'critical' : 'healthy'}>{active.length} active</Badge>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {active.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-muted">You're all caught up.</li>}
            {active.slice(0, 6).map((a) => (
              <li key={a.id} className="border-b border-line px-4 py-3 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{a.title}</p>
                  <Badge tone={alertTone[a.severity]}>{a.severity}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{a.message} · {timeAgo(a.createdAt)}</p>
              </li>
            ))}
          </ul>
          <Link to="/app/alerts" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-sm font-medium text-brand hover:bg-canvas">View all alerts</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  if (!session) return null;
  const items = [
    { to: '/app/profile', label: 'Profile', icon: UserIcon },
    { to: '/app/settings', label: 'Settings', icon: Settings },
    { to: '/app/team', label: 'Team', icon: Users },
  ];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-brand-50" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <Avatar name={session.user.name} color={session.user.avatarColor} />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium leading-4 text-ink">{session.user.name}</span>
          <span className="block text-[11px] text-ink-muted">{session.role ? roleLabels[session.role] : 'No organization'}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-faint sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-60 rounded-xl border border-line bg-white py-1 shadow-pop">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{session.user.name}</p>
            <p className="truncate text-xs text-ink-muted">{session.user.email}</p>
          </div>
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} role="menuitem" to={to} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-canvas">
              <Icon className="h-4 w-4 text-ink-muted" /> {label}
            </Link>
          ))}
          <div className="my-1 border-t border-line" />
          <Link role="menuitem" to="/logout" className="flex items-center gap-2 px-3 py-2 text-sm text-critical hover:bg-critical-bg">
            <LogOut className="h-4 w-4" /> Sign out
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { loading, error, reload, workspace } = useWorkspace();
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-[#FBFCFB] lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-in bg-white shadow-lift">
            <button className="absolute right-3 top-4 rounded-md p-1.5 text-ink-muted hover:bg-canvas" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <MockBanner />
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="rounded-lg p-2 text-ink-muted hover:bg-canvas lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><MenuIcon className="h-5 w-5" /></button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <Notifications />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          {error && !workspace ? (
            <div className="card mx-auto max-w-lg p-8 text-center">
              <p className="text-sm font-semibold text-ink">We couldn't load your workspace</p>
              <p className="mt-1 text-sm text-ink-muted">{error}</p>
              <button onClick={() => void reload()} className="mt-4 text-sm font-medium text-brand hover:underline">Try again</button>
            </div>
          ) : loading && !workspace ? (
            <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-6 w-6" /></div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
