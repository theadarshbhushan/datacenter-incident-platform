import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/utils/cn';

type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: Tone; title: string; description?: string }
interface ToastApi { toast: (t: Omit<Toast, 'id'>) => void; success: (title: string, description?: string) => void; error: (title: string, description?: string) => void; info: (title: string, description?: string) => void }

const ToastContext = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++counter;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500);
  }, []);
  const api: ToastApi = {
    toast,
    success: (title, description) => toast({ tone: 'success', title, description }),
    error: (title, description) => toast({ tone: 'error', title, description }),
    info: (title, description) => toast({ tone: 'info', title, description }),
  };
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:w-96" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex w-full animate-fade-in items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-pop">
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', t.tone === 'success' && 'text-brand', t.tone === 'error' && 'text-critical', t.tone === 'info' && 'text-info')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-ink-faint hover:text-ink" aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
