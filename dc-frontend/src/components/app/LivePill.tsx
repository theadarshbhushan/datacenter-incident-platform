import type { TelemetryHealth } from '@/types/domain';
import { timeAgo } from '@/utils/format';

const styles = {
  live: 'border-healthy-line bg-healthy-bg text-brand-700',
  stale: 'border-warning/30 bg-warning-bg text-warning',
  demo: 'border-line bg-white text-ink-muted',
  waiting: 'border-line bg-white text-ink-muted',
};

/**
 * Monitoring status from the backend's telemetry health. "Live" only when real telemetry arrived in
 * the last 5 minutes; otherwise it says what is actually going on.
 */
export function LivePill({ telemetry }: { telemetry?: TelemetryHealth }) {
  const status = telemetry?.status ?? 'waiting';
  const label = {
    live: `Live · ${telemetry?.serversReporting ?? 0} reporting`,
    stale: `No telemetry since ${timeAgo(telemetry?.lastReceivedAt)}`,
    demo: 'Sample telemetry',
    waiting: 'Waiting for telemetry',
  }[status];
  return (
    <span className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${styles[status]}`} title={telemetry?.lastReceivedAt ? `Last telemetry ${timeAgo(telemetry.lastReceivedAt)}` : undefined}>
      <span className="relative flex h-2 w-2">
        {status === 'live' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${status === 'live' ? 'bg-brand' : status === 'stale' ? 'bg-warning' : 'bg-ink-faint'}`} />
      </span>
      {label}
    </span>
  );
}
