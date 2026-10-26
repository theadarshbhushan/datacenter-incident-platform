import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface TabItem<T extends string> { id: T; label: ReactNode; count?: number }

/** Underlined tabs, as in the reference design. */
export function Tabs<T extends string>({ items, value, onChange, className }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('-mb-px flex gap-1 overflow-x-auto border-b border-line', className)} role="tablist">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
            value === t.id ? 'border-brand text-brand' : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-canvas px-1.5 py-0.5 text-[11px] text-ink-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Pill segmented control (CPU / Memory / Network / Storage in the reference). */
export function Segmented<T extends string>({ items, value, onChange, className }: { items: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-lg bg-canvas p-1', className)} role="tablist">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors', value === t.id ? 'bg-brand-100 text-brand-700' : 'text-ink-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
