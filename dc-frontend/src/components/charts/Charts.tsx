import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/utils/cn';

/** Chart palette. Severity colors double as status colors and always ship with a legend and labels. */
export const chartColors = {
  critical: '#DC2626',
  major: '#F59E0B',
  minor: '#22A05A',
  brand: '#16834A',
  brandSoft: '#94D5AD',
  grid: '#EDF2EE',
  axis: '#8A978F',
};

const axisProps = { tick: { fontSize: 11, fill: chartColors.axis }, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, unit = '' }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: ReactNode; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <p className="mb-1 font-medium text-ink">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
          {p.name}: <span className="font-medium text-ink">{p.value}{unit}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; value?: ReactNode }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.color }} aria-hidden />
          {i.label}
          {i.value !== undefined && <span className="font-medium text-ink">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface TrendPoint { label: string; critical: number; major: number; minor: number }

export function IncidentTrendChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Incidents per day by severity">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip cursor={{ fill: '#F1FAF4' }} content={<TooltipBox />} />
          <Bar dataKey="critical" name="Critical" fill={chartColors.critical} radius={[4, 4, 0, 0]} barSize={12} isAnimationActive={false} />
          <Bar dataKey="major" name="Major" fill={chartColors.major} radius={[4, 4, 0, 0]} barSize={12} isAnimationActive={false} />
          <Bar dataKey="minor" name="Minor" fill={chartColors.minor} radius={[4, 4, 0, 0]} barSize={12} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaMetricChart({ data, height = 220, color = chartColors.brand, unit = '%', name = 'Value', domain = [0, 100] }: {
  data: { label: string; value: number }[]; height?: number; color?: string; unit?: string; name?: string; domain?: [number, number | 'auto'];
}) {
  const id = `g-${color.replace('#', '')}-${name.replace(/\W/g, '')}`;
  return (
    <div style={{ height }} role="img" aria-label={`${name} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis domain={domain} {...axisProps} />
          <Tooltip content={<TooltipBox unit={unit} />} cursor={{ stroke: color, strokeDasharray: '3 3' }} />
          <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineMetricChart({ data, height = 200, color = chartColors.brand, unit = '%', name = 'Value', domain }: {
  data: { label: string; value: number }[]; height?: number; color?: string; unit?: string; name?: string; domain?: [number | 'auto', number | 'auto'];
}) {
  return (
    <div style={{ height }} role="img" aria-label={`${name} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey="label" {...axisProps} minTickGap={28} />
          <YAxis domain={domain ?? ['auto', 'auto']} {...axisProps} />
          <Tooltip content={<TooltipBox unit={unit} />} />
          <Line type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, centerLabel, centerValue, height = 180 }: { data: { name: string; value: number; color: string }[]; centerLabel: string; centerValue: ReactNode; height?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="relative" style={{ height, width: height }} role="img" aria-label={`${centerLabel}: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={total ? data : [{ name: 'None', value: 1, color: '#E3EAE5' }]} dataKey="value" innerRadius="70%" outerRadius="100%" paddingAngle={total ? 2 : 0} stroke="none" isAnimationActive={false}>
            {(total ? data : [{ color: '#E3EAE5' }]).map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          {total > 0 && <Tooltip content={<TooltipBox />} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-ink">{centerValue}</span>
        <span className="text-[11px] text-ink-muted">{centerLabel}</span>
      </div>
    </div>
  );
}

export function SimpleBarChart({ data, height = 220, color = chartColors.brand, unit = '', name = 'Count', layout = 'vertical-bars' }: {
  data: { label: string; value: number }[]; height?: number; color?: string; unit?: string; name?: string; layout?: 'vertical-bars' | 'horizontal-bars';
}) {
  const horizontal = layout === 'horizontal-bars';
  return (
    <div style={{ height }} role="img" aria-label={`${name} by category`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 8 : -24, bottom: 0 }}>
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={chartColors.grid} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...axisProps} width={84} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" {...axisProps} interval={0} />
              <YAxis allowDecimals={false} {...axisProps} />
            </>
          )}
          <Tooltip cursor={{ fill: '#F1FAF4' }} content={<TooltipBox unit={unit} />} />
          <Bar dataKey="value" name={name} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ data, color = chartColors.critical, height = 70 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip content={<TooltipBox />} />
          <Line type="monotone" dataKey="value" name="Value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Sequential green→amber→red scale for probabilities in [0,1]. */
export function riskColor(p: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [134, 205, 150]], [0.35, [214, 226, 118]], [0.55, [246, 196, 92]], [0.75, [242, 133, 82]], [1, [226, 72, 72]],
  ];
  const v = Math.max(0, Math.min(1, p));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i]!;
    const [p0, c0] = stops[i - 1]!;
    if (v <= p1) {
      const t = (v - p0) / (p1 - p0);
      const c = c0.map((x, j) => Math.round(x + (c1[j]! - x) * t));
      return `rgb(${c.join(',')})`;
    }
  }
  return 'rgb(226,72,72)';
}

export function RiskHeatmap({ rows, columns, onSelect }: {
  rows: { id: string; label: string; values: number[] }[];
  columns: string[];
  onSelect?: (rowId: string, colIdx: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] table-fixed border-separate" style={{ borderSpacing: 3 }}>
        <caption className="sr-only">Predicted incident probability by asset and time horizon</caption>
        <thead>
          <tr>
            <th className="w-24" />
            {columns.map((c) => <th key={c} scope="col" className="pt-1 text-center text-[11px] font-medium text-ink-muted">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="whitespace-nowrap pr-2 text-left text-xs font-medium text-ink">{r.label}</th>
              {r.values.map((v, i) => (
                <td key={i} className="p-0">
                  <button
                    type="button"
                    onClick={() => onSelect?.(r.id, i)}
                    className="group relative block h-7 w-full rounded-[4px] transition-transform hover:scale-[1.06] focus-visible:scale-[1.06]"
                    style={{ backgroundColor: riskColor(v) }}
                    aria-label={`${r.label}, ${columns[i]}: ${Math.round(v * 100)}% probability`}
                  >
                    <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink shadow-pop group-hover:block group-focus-visible:block">
                      {Math.round(v * 100)}%
                    </span>
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
