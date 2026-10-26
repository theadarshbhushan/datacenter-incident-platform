import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest }, ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn('field h-10', invalid && 'field-error', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest }, ref,
) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn('field min-h-[96px] resize-y', invalid && 'field-error', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest }, ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'field h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364736A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        invalid && 'field-error', className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-critical">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

interface FormFieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: (props: { id: string; 'aria-describedby'?: string; invalid: boolean }) => ReactNode;
  action?: ReactNode;
  className?: string;
  optional?: boolean;
}

/** Label + control + hint/error with correct aria wiring. */
export function FormField({ label, error, hint, children, action, className, optional }: FormFieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-faint">(optional)</span>}
        </label>
        {action}
      </div>
      {children({ id, 'aria-describedby': describedBy, invalid: !!error })}
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function PasswordInput(
  { className, invalid, ...rest }, ref,
) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input ref={ref} type={show ? 'text' : 'password'} aria-invalid={invalid || undefined} className={cn('field h-10 pr-10', invalid && 'field-error', className)} {...rest} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-ink-faint hover:text-ink"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }>(function Checkbox(
  { label, className, id, ...rest }, ref,
) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-ink', className)}>
      <input ref={ref} id={cid} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-brand accent-[#16834A] focus:ring-brand/30" {...rest} />
      <span className="leading-5">{label}</span>
    </label>
  );
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand' : 'bg-line-strong')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
