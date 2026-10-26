import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export const faqs = [
  { q: 'How does VaultWatch predict failures?', a: 'It combines anomaly detection on live telemetry (CPU, memory, temperature, power, network) with models trained on historical incidents. Each prediction shows a probability of an incident within a time horizon and, separately, how confident the model is in that estimate.' },
  { q: 'What is the difference between probability and confidence?', a: 'Probability is the estimated chance that an incident happens within the horizon. Confidence describes how reliable the model considers that estimate, based on data quality and how similar the situation is to what it was trained on. A 40% probability with 90% confidence is a well-understood moderate risk.' },
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
