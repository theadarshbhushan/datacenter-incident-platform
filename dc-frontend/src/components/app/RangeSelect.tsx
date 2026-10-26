import { Calendar } from 'lucide-react';
import { rangePresets, type RangeId } from '@/utils/analytics';

export function RangeSelect({ value, onChange, label = 'Date range' }: { value: RangeId; onChange: (v: RangeId) => void; label?: string }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <Calendar className="pointer-events-none absolute left-3 h-4 w-4 text-ink-muted" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RangeId)}
        className="h-9 appearance-none rounded-lg border border-line bg-white pl-9 pr-8 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
      >
        {rangePresets.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-2.5 h-4 w-4 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
    </label>
  );
}
