import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/services/api';
import type { MetricKey, MetricSeries } from '@/types/domain';

/**
 * Loads 5-minute metric averages from the API (fleet-wide when serverId is null) and refreshes them
 * every `refreshMs`. Failures are reported, never replaced with made-up values.
 */
export function useMetrics(serverId: string | null, window: MetricSeries['window'], metrics: MetricKey[], enabled = true, refreshMs = 60_000) {
  const [data, setData] = useState<MetricSeries | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const key = metrics.join(',');

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    try {
      setData(await api.getMetrics(serverId, window, key.split(',') as MetricKey[]));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load metrics.'));
    } finally {
      setLoading(false);
    }
  }, [serverId, window, key, enabled]);

  useEffect(() => {
    setLoading(enabled);
    void load();
    if (!enabled) return;
    const t = setInterval(() => void load(), refreshMs);
    return () => clearInterval(t);
  }, [load, enabled, refreshMs]);

  return { data, loading, error, reload: load };
}

/** Chart points for one metric: time label + value (null keeps gaps visible). */
export function seriesFor(data: MetricSeries | null, metric: MetricKey) {
  return (data?.points ?? []).map((p) => ({
    label: new Date(p.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    value: p[metric] ?? null,
  }));
}
