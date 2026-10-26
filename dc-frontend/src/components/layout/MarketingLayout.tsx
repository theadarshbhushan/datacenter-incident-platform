import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, X } from 'lucide-react';
import { Logo, ButtonLink } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';
import { config } from '@/config/env';
import { MockBanner } from './MockBanner';

const nav = [
  { to: '/#product', label: 'Product' },
  { to: '/features', label: 'Features' },
  { to: '/solutions', label: 'Solutions' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/documentation', label: 'Documentation' },
];

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);
  const { session } = useAuth();
  const { pathname, hash } = useLocation();
  useEffect(() => setOpen(false), [pathname, hash]);
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => cn('rounded-md px-3 py-2 text-sm font-medium transition-colors', isActive && !n.to.includes('#') ? 'text-brand' : 'text-ink-muted hover:text-ink')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {session ? (
            <ButtonLink to="/app/dashboard">Open dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost">Login</ButtonLink>
              <ButtonLink to="/signup">Get Started</ButtonLink>
            </>
          )}
        </div>
        <button className="rounded-md p-2 text-ink lg:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-white lg:hidden">
          <nav className="container-page flex flex-col py-3" aria-label="Mobile">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md px-2 py-2.5 text-sm font-medium text-ink hover:bg-canvas">{n.label}</Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
              {session ? (
                <ButtonLink to="/app/dashboard" className="col-span-2">Open dashboard</ButtonLink>
              ) : (
                <>
                  <ButtonLink to="/login" variant="secondary">Login</ButtonLink>
                  <ButtonLink to="/signup">Get Started</ButtonLink>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

const footer = [
  { title: 'Product', links: [['Features', '/features'], ['Pricing', '/pricing'], ['Platform preview', '/#product'], ['Get started', '/signup']] },
  { title: 'Resources', links: [['Documentation', '/documentation'], ['API integration', '/documentation#api'], ['Getting started', '/documentation#getting-started'], ['FAQ', '/#faq']] },
  { title: 'Company', links: [['Solutions', '/solutions'], ['Security', '/#security'], ['Contact sales', '/contact?subject=sales'], ['Sign in', '/login']] },
  { title: 'Legal', links: [['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']] },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-6">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-6 text-ink-muted">AI-assisted incident management and predictive monitoring for data center teams.</p>
          <div className="mt-5">
            <p className="text-sm font-semibold text-ink">Contact</p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
              <li><Link to="/contact" className="hover:text-brand">Contact form</Link></li>
              <li><a href={`mailto:${config.supportEmail}`} className="hover:text-brand">{config.supportEmail}</a></li>
            </ul>
          </div>
        </div>
        {footer.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold text-ink">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map(([label, to]) => (
                <li key={label}><Link to={to!} className="text-sm text-ink-muted hover:text-brand">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} VaultWatch. Company details are placeholders pending legal setup.</p>
          <p>Demo pricing and sample data are illustrative.</p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); return; }
    }
    window.scrollTo(0, 0);
  }, [hash, pathname]);
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <MockBanner />
      <MarketingNavbar />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

export function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: ReactNode; description: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-line bg-white">
      <div className="container-page py-16 text-center sm:py-20">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-bold text-ink sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">{description}</p>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
