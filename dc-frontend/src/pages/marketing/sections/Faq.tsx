import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export const faqs = [
  { q: 'Does VaultWatch predict hardware failures?', a: 'No. It detects unusual behavior in live telemetry (CPU, memory, temperature, power, network) against each server\'s own baseline, and offers an experimental one-hour early warning for metric surges. It does not claim validated failure prediction, because that needs labeled failure history.' },
  { q: 'What do the scores mean?', a: 'The anomaly score ranks how unusual a reading is; it is not a probability. The early warning shows a probability only when its calibration passed testing. Confidence says how much history backs a result. Severity is the operating decision made from fixed thresholds.' },
  { q: 'Do I need to connect real servers to try it?', a: 'No. You can explore the full product with a clearly labeled sample environment. Connecting real infrastructure is optional and can be done later from Integrations.' },
  { q: 'How do you collect data from my infrastructure?', a: 'Through lightweight agents, Prometheus-compatible scraping or the ingestion API with an organization-scoped API key. You choose what is sent.' },
  { q: 'Who can see my data?', a: 'Only members of your organization, according to their role. Every API request is checked on the server against your organization and permissions.' },
  { q: 'Is the pricing final?', a: 'No. Prices shown are illustrative while plans are being finalized. Nothing is charged during the trial.' },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {faqs.map((f, i) => (
        <div key={f.q}>
          <h3>
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-ink" aria-expanded={open === i} aria-controls={`faq-${i}`}>
              {f.q}
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open === i && 'rotate-180')} aria-hidden />
            </button>
          </h3>
          {open === i && <p id={`faq-${i}`} className="px-5 pb-5 text-sm leading-6 text-ink-muted">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}
