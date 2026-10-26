import type { ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { AlertSeverity, HealthStatus, IncidentStatus, Severity } from '@/types/domain';

export type Tone = 'critical' | 'warning' | 'healthy' | 'info' | 'violet' | 'neutral' | 'orange';

const tones: Record<Tone, string> = {
  critical: 'bg-critical-bg text-critical border-critical-line',
  warning: 'bg-warning-bg text-warning border-warning-line',
  healthy: 'bg-healthy-bg text-brand-700 border-healthy-line',
  info: 'bg-info-bg text-info border-info-line',
  violet: 'bg-violet-bg text-violet border-violet-line',
  orange: 'bg-orange-bg text-orange border-orange-line',
  neutral: 'bg-canvas text-ink-muted border-line',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export const severityTone: Record<Severity, Tone> = { critical: 'critical', major: 'warning', minor: 'healthy' };
export const statusTone: Record<IncidentStatus, Tone> = { ongoing: 'orange', investigating: 'violet', resolved: 'healthy' };
export const healthTone: Record<HealthStatus, Tone> = { healthy: 'healthy', warning: 'warning', critical: 'critical', offline: 'neutral' };
export const alertTone: Record<AlertSeverity, Tone> = { critical: 'critical', warning: 'warning', info: 'info' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const SeverityBadge = ({ severity }: { severity: Severity }) => <Badge tone={severityTone[severity]}>{cap(severity)}</Badge>;
export const StatusBadge = ({ status }: { status: IncidentStatus }) => <Badge tone={statusTone[status]}>{cap(status)}</Badge>;
export const HealthBadge = ({ status }: { status: HealthStatus }) => <Badge tone={healthTone[status]} dot>{cap(status)}</Badge>;

/** Marks anything that is illustrative rather than produced by a live system. */
export function SampleBadge({ label = 'Sample data', className }: { label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border border-warning-line bg-warning-bg px-2 py-0.5 text-[11px] font-medium text-warning', className)} title="Illustrative data. Not produced by a live model or real infrastructure.">
      <FlaskConical className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
