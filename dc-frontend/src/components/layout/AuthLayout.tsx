import type { ReactNode } from 'react';
import { Activity, BrainCircuit, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui';
import { MockBanner } from './MockBanner';

const points = [
  { icon: BrainCircuit, title: 'Catch problems early', text: 'Anomaly detection on every server, with the evidence behind each alert.' },
  { icon: Activity, title: 'Resolve incidents faster', text: 'Timelines, probable root cause and remediation steps in one place.' },
  { icon: ShieldCheck, title: 'Built for operations teams', text: 'Roles, audit history and organization-scoped data.' },
];

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <MockBanner />
      <div className="flex flex-1">
        <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden border-r border-line bg-white p-10 lg:flex">
          <Logo />
          <div>
            <h2 className="text-3xl font-bold leading-tight text-ink">Predict infrastructure failures before they cause downtime.</h2>
            <ul className="mt-8 space-y-5">
              {points.map(({ icon: Icon, title: t, text }) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand"><Icon className="h-5 w-5" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t}</span>
                    <span className="block text-sm text-ink-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-ink-faint">© {new Date().getFullYear()} VaultWatch</p>
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand-100/60" aria-hidden />
        </aside>
        <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:px-6">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden"><Logo /></div>
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
