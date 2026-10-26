import { Check } from 'lucide-react';
import { plans, PRICING_IS_ILLUSTRATIVE } from '@/data/plans';
import { ButtonLink } from '@/components/ui';
import { cn } from '@/utils/cn';

export function PricingCards() {
  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={cn('relative flex flex-col rounded-2xl border bg-white p-6', p.highlighted ? 'border-brand shadow-lift' : 'border-line shadow-card')}>
            {p.highlighted && <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white">Most popular</span>}
            <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
            <p className="mt-1 text-sm text-ink-muted">{p.description}</p>
            <p className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-ink">{p.price === 0 ? '$0' : `$${p.price!.toLocaleString()}`}</span>
            </p>
            <p className="text-xs text-ink-muted">{p.priceNote}</p>
            <ButtonLink to={`/signup?plan=${p.id}`} variant={p.highlighted ? 'primary' : 'secondary'} className="mt-6 w-full">{p.cta}</ButtonLink>
            <ul className="mt-6 space-y-2.5">
              <li className="text-xs font-medium uppercase tracking-wide text-ink-faint">Up to {p.limits.servers.toLocaleString()} servers · {p.limits.members} members</li>
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {PRICING_IS_ILLUSTRATIVE && (
        <p className="mt-5 text-center text-xs text-ink-muted">Illustrative pricing for demonstration. Final prices have not been set and no payment is collected.</p>
      )}
    </div>
  );
}
