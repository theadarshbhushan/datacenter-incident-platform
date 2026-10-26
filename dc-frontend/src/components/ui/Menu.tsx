import { useRef, useState, type ReactNode } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/utils/cn';

export interface MenuItem { label: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean; hidden?: boolean }

export function Menu({ trigger, items, align = 'right', label }: { trigger: ReactNode; items: (MenuItem | 'divider')[]; align?: 'left' | 'right'; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const visible = items.filter((i) => i === 'divider' || !i.hidden);
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink">
        {trigger}
      </button>
      {open && (
        <div role="menu" className={cn('absolute z-50 mt-1 min-w-[190px] animate-fade-in rounded-xl border border-line bg-white py-1 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}>
          {visible.map((item, i) =>
            item === 'divider' ? (
              <div key={`d${i}`} className="my-1 border-t border-line" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onSelect(); }}
                className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50', item.danger ? 'text-critical hover:bg-critical-bg' : 'text-ink hover:bg-canvas')}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
