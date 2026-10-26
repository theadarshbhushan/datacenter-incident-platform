import { Building2, CheckCircle2, GitBranch, Layers, Wrench } from 'lucide-react';
import { MarketingLayout, PageHero } from '@/components/layout/MarketingLayout';
import { ButtonLink } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const solutions = [
  {
    id: 'operators', icon: Building2, title: 'Data center operators',
    problem: 'Thermal and power problems build slowly and surface suddenly, often at the worst time.',
    outcomes: ['Spot racks running out of thermal headroom', 'Track power draw against branch circuit capacity', 'Plan maintenance from predicted risk instead of fixed schedules'],
  },
  {
    id: 'engineers', icon: Wrench, title: 'Infrastructure engineers',
    problem: 'Failing disks, PSUs and optics hide inside noisy alerts until they cause an outage.',
    outcomes: ['Predict hardware failures days ahead', 'See contributing factors like SMART counters and CRC errors', 'Replace parts during planned windows'],
  },
  {
    id: 'sre', icon: GitBranch, title: 'SRE and DevOps teams',
    problem: 'Infrastructure issues look like application bugs, and the other way around.',
    outcomes: ['Correlate incidents with deployments and workload changes', 'Shared incident timelines with acknowledgement and ownership', 'Integrate with Slack, webhooks and PagerDuty'],
  },
  {
    id: 'msp', icon: Layers, title: 'Managed service providers',
    problem: 'Each customer needs isolation, their own team and reports you can stand behind.',
    outcomes: ['One organization per customer with strict data isolation', 'Role-based access for your staff and theirs', 'Uptime and MTTR reports per customer'],
  },
];

export default function Solutions() {
  useDocumentTitle('Solutions');
  return (
    <MarketingLayout>
      <PageHero eyebrow="Solutions" title="Reliability for every team that touches infrastructure" description="VaultWatch adapts to how your organization operates, from a single hall to a portfolio of customer sites." />
      <div className="container-page grid gap-6 py-16 lg:grid-cols-2">
        {solutions.map(({ id, icon: Icon, title, problem, outcomes }) => (
          <section key={id} id={id} className="card scroll-mt-24 p-6 sm:p-8">
            <Icon className="h-7 w-7 text-brand" />
            <h2 className="mt-4 text-xl font-bold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted"><span className="font-medium text-ink">The challenge: </span>{problem}</p>
            <ul className="mt-5 space-y-2.5">
              {outcomes.map((o) => <li key={o} className="flex gap-2.5 text-sm text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{o}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <div className="container-page pb-20 text-center">
        <h2 className="text-2xl font-bold text-ink">Not sure which fits?</h2>
        <p className="mt-2 text-sm text-ink-muted">Tell us about your environment and we'll suggest a setup.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink to="/contact?subject=sales">Contact sales</ButtonLink>
          <ButtonLink to="/signup" variant="secondary">Start a free trial</ButtonLink>
        </div>
      </div>
    </MarketingLayout>
  );
}
