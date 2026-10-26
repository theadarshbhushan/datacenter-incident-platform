import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';
import { passwordStrength } from '@/utils/password';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand', className)} aria-label={label} role="status" />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-ink-muted">
      <Spinner className="h-6 w-6" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line/70', className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const calloutStyles = {
  info: { box: 'border-info-line bg-info-bg text-info', Icon: Info },
  warning: { box: 'border-warning-line bg-warning-bg text-warning', Icon: AlertTriangle },
  error: { box: 'border-critical-line bg-critical-bg text-critical', Icon: AlertCircle },
  success: { box: 'border-healthy-line bg-healthy-bg text-brand-700', Icon: CheckCircle2 },
};

export function Callout({ tone = 'info', title, children, className, action }: { tone?: keyof typeof calloutStyles; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const { box, Icon } = calloutStyles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'note'} className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn('text-ink-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Avatar({ name, color = '#16834A', size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-7 w-7 text-[11px]', md: 'h-8 w-8 text-xs', lg: 'h-14 w-14 text-lg' }[size];
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', s)} style={{ backgroundColor: color }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Pagination({ page, pageCount, total, pageSize, onChange }: { page: number; pageCount: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted sm:flex-row">
      <span>Showing <strong className="font-medium text-ink">{from}–{to}</strong> of <strong className="font-medium text-ink">{total}</strong></span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        {Array.from({ length: pageCount }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1)
          .map((p, i, arr) => (
            <span key={p} className="flex items-center">
              {i > 0 && p - arr[i - 1]! > 1 && <span className="px-1">…</span>}
              <button onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined} className={cn('h-8 min-w-8 rounded-md px-2 text-sm', p === page ? 'bg-brand text-white' : 'hover:bg-canvas')}>{p}</button>
            </span>
          ))}
        <button onClick={() => onChange(page + 1)} disabled={page >= pageCount} className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password);
  if (!password) return null;
  const color = ['bg-critical', 'bg-critical', 'bg-warning', 'bg-brand-400', 'bg-brand'][s.score];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => <div key={i} className={cn('h-1.5 flex-1 rounded-full', i < s.score ? color : 'bg-line')} />)}
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">Password strength: <span className="font-medium text-ink">{s.label}</span></p>
      <ul className="mt-1.5 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
        {s.checks.map((c) => (
          <li key={c.label} className={cn('flex items-center gap-1.5 text-xs', c.ok ? 'text-brand-700' : 'text-ink-faint')}>
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatPill({ tone, children }: { tone: 'critical' | 'warning' | 'healthy' | 'neutral'; children: ReactNode }) {
  const dot = { critical: 'bg-critical', warning: 'bg-warning', healthy: 'bg-brand', neutral: 'bg-ink-faint' }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden />
      {children}
    </span>
  );
}
