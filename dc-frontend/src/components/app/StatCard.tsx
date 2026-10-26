import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export function StatCard({ icon, iconTone, value, label, footer, to }: { icon: ReactNode; iconTone: string; value: ReactNode; label: string; footer?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconTone)}>{icon}</span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight text-ink">{value}</p>
          <p className="text-sm text-ink-muted">{label}</p>
        </div>
      </div>
      {footer && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">{footer}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="card block p-4 transition-shadow hover:shadow-pop">{body}</Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
