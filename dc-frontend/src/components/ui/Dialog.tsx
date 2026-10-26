import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { cn } from '@/utils/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input, select, textarea, button[data-autofocus]')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('relative max-h-[92vh] w-full animate-fade-in overflow-y-auto rounded-t-2xl bg-white shadow-lift sm:rounded-2xl', size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-lg', size === 'lg' && 'sm:max-w-2xl')}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close dialog"><X className="h-4 w-4" /></button>
        </div>
        {children && <div className="px-5 py-4">{children}</div>}
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Require typing this text before confirming (for high-impact destructive actions). */
  confirmText?: string;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', destructive, confirmText }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);
  const blocked = !!confirmText && typed.trim() !== confirmText;
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {destructive && <AlertTriangle className="h-4 w-4 text-critical" aria-hidden />}
          {title}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={busy}
            disabled={blocked}
            data-autofocus
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); onClose(); } finally { setBusy(false); }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-muted">{description}</div>
      {confirmText && (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm text-ink">Type <span className="font-mono font-semibold">{confirmText}</span> to confirm</label>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      )}
    </Dialog>
  );
}
