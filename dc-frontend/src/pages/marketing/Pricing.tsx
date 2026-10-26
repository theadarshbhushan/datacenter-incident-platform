import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { MarketingLayout, PageHero } from '@/components/layout/MarketingLayout';
import { ButtonLink } from '@/components/ui';
import { comparison, plans } from '@/data/plans';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PricingCards } from './sections/PricingCards';
import { Faq } from './sections/Faq';

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto h-4 w-4 text-brand" aria-label="Included" />;
  if (v === false) return <Minus className="mx-auto h-4 w-4 text-ink-faint" aria-label="Not included" />;
  return <span className="text-sm text-ink">{v}</span>;
}

export default function Pricing() {
  useDocumentTitle('Pricing');
  return (
    <MarketingLayout>
      <PageHero eyebrow="Pricing" title="Simple plans that grow with your fleet" description="Start with a free 14-day trial. Prices below are illustrative while plans are finalized." />
      <div className="container-page py-16">
        <PricingCards />
        <section className="mt-20" aria-labelledby="compare">
          <h2 id="compare" className="text-center text-2xl font-bold text-ink">Compare plans</h2>
          <div className="card mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th w-2/5">Feature</th>
                  {plans.map((p) => <th key={p.id} className="th text-center">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {comparison.map((g) => (
                  <Fragment key={g.group}>
                    <tr className="bg-canvas"><td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.group}</td></tr>
                    {g.rows.map((r) => (
                      <tr key={g.group + r.label} className="border-b border-line last:border-0">
                        <td className="td">{r.label}</td>
                        {r.values.map((v, i) => <td key={i} className="td text-center"><Cell v={v} /></td>)}
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr>
                  <td className="td" />
                  {plans.map((p) => <td key={p.id} className="td text-center"><ButtonLink to={`/signup?plan=${p.id}`} size="sm" variant={p.highlighted ? 'primary' : 'secondary'}>{p.cta}</ButtonLink></td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-ink-muted">Need more than 2,000 servers or custom terms? <a href="/contact?subject=sales" className="font-medium text-brand hover:underline">Contact sales</a>.</p>
        </section>
        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="mb-6 text-center text-2xl font-bold text-ink">Questions</h2>
          <Faq />
        </section>
      </div>
    </MarketingLayout>
  );
}
