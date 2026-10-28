import { Activity, BarChart3, BrainCircuit, CheckCircle2, Radar, ScanSearch, Server } from 'lucide-react';
import { MarketingLayout, PageHero } from '@/components/layout/MarketingLayout';
import { ButtonLink } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const sections = [
  {
    id: 'incident-management', icon: Activity, title: 'Incident management',
    text: 'A single queue for every incident, whether it was opened by an alert rule, an anomaly model or an engineer.',
    points: ['Search and filter by severity, status, rack and date', 'Assign, acknowledge, resolve and reopen with a full audit trail', 'Timeline of every status change, comment and AI insight', 'Affected infrastructure and live metrics on the incident page'],
  },
  {
    id: 'predictive-analytics', icon: BrainCircuit, title: 'Predictive analytics',
    text: 'Risk scores per server and rack for 6-hour, 24-hour, 72-hour and 7-day horizons.',
    points: ['Anomaly score, severity and confidence shown as separate things', 'Experimental one-hour early warning, labeled as such', 'Per-metric contributing factors against each server\'s baseline', 'Published evaluation results for every model version'],
  },
  {
    id: 'anomaly-detection', icon: Radar, title: 'Anomaly detection',
    text: 'Baselines learned per asset catch unusual behavior long before static thresholds would.',
    points: ['Isolation Forest and gradient-boosted models for multivariate anomalies', 'Sensitivity configurable per organization', 'Optional automatic incident creation', 'Alert rules for the thresholds you already rely on'],
  },
  {
    id: 'root-cause-analysis', icon: ScanSearch, title: 'Root-cause analysis',
    text: 'Each incident carries a probable root cause with the evidence behind it.',
    points: ['Suspected cause with the evidence behind it', 'Ranked contributing factors', 'Remediation suggestions engineers can follow', 'Your team confirms the actual cause'],
  },
  {
    id: 'infrastructure-monitoring', icon: Server, title: 'Infrastructure monitoring',
    text: 'See every hall, rack and server at a glance, then drill into the details.',
    points: ['Interactive rack layout per data center', 'CPU, memory, temperature, power and connectivity per server', 'Rack power draw against capacity', 'Health status rolled up from servers to racks'],
  },
  {
    id: 'reporting', icon: BarChart3, title: 'Reporting',
    text: 'Share reliability with leadership and customers using numbers everyone agrees on.',
    points: ['Incidents by severity and category', 'Uptime trends, downtime and MTTR', 'Resource usage across the fleet', 'Date filters and CSV export'],
  },
];

export default function Features() {
  useDocumentTitle('Features');
  return (
    <MarketingLayout>
      <PageHero eyebrow="Features" title="Everything your operations team needs to stay ahead of failures" description="Incident response, prediction and monitoring designed to work together instead of as separate tools.">
        <div className="flex flex-wrap justify-center gap-2">
          {sections.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand hover:text-brand">{s.title}</a>)}
        </div>
      </PageHero>
      <div className="container-page space-y-6 py-16">
        {sections.map(({ id, icon: Icon, title, text, points }) => (
          <section key={id} id={id} className="card grid scroll-mt-24 gap-6 p-6 sm:p-8 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand"><Icon className="h-5 w-5" /></span>
              <h2 className="mt-4 text-xl font-bold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{text}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
              {points.map((p) => (
                <li key={p} className="flex gap-2.5 rounded-xl bg-canvas p-4 text-sm text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{p}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="pt-6 text-center">
          <ButtonLink to="/signup" size="lg">Get Started Free</ButtonLink>
        </div>
      </div>
    </MarketingLayout>
  );
}
