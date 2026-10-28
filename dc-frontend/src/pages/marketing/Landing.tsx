import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, BarChart3, BellRing, BrainCircuit, Building2, CheckCircle2, Cloud, FileLock2, GitBranch, KeyRound,
  Layers, Network, Radar, ScanSearch, Server, ShieldCheck, Users, Wrench,
} from 'lucide-react';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { ButtonLink, SampleBadge } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { DashboardPreview } from './sections/DashboardPreview';
import { PricingCards } from './sections/PricingCards';
import { Faq } from './sections/Faq';

const features = [
  { icon: Activity, title: 'Incident management', text: 'Triage, assign, acknowledge and resolve incidents with a full timeline and action history.' },
  { icon: BrainCircuit, title: 'Predictive analytics', text: 'Anomaly detection per server against its own baseline, plus an experimental one-hour early warning.' },
  { icon: Radar, title: 'Anomaly detection', text: 'Spot unusual CPU, memory, thermal, power and network behavior before thresholds trip.' },
  { icon: ScanSearch, title: 'Root-cause analysis', text: 'Probable cause, contributing factors and remediation steps attached to each incident.' },
  { icon: Server, title: 'Infrastructure monitoring', text: 'Rack and server views with temperature, power, utilization and connectivity.' },
  { icon: BarChart3, title: 'Reporting', text: 'Uptime, downtime, MTTR and incident categories with CSV export.' },
];

const steps = [
  { n: '01', title: 'Connect', text: 'Start with a sample environment, or stream telemetry through agents, Prometheus or the ingestion API.' },
  { n: '02', title: 'Learn', text: 'VaultWatch builds baselines for every server and rack and flags deviations as they happen.' },
  { n: '03', title: 'Predict', text: 'Models estimate the likelihood of incidents in the hours and days ahead, with the factors behind each estimate.' },
  { n: '04', title: 'Resolve', text: 'Teams act on prioritized incidents with suggested remediation and a shared timeline.' },
];

const segments = [
  { icon: Building2, title: 'Data center operators', text: 'Track thermal headroom, power draw and hardware health across halls and sites.' },
  { icon: Wrench, title: 'Infrastructure engineers', text: 'Find failing disks, PSUs and optics before they take services down.' },
  { icon: GitBranch, title: 'SRE and DevOps teams', text: 'Correlate infrastructure risk with deployments and service incidents.' },
  { icon: Layers, title: 'Managed service providers', text: 'Separate organizations per customer with role-based access.' },
];

const security = [
  { icon: KeyRound, title: 'Secure sessions', text: 'HttpOnly, Secure, SameSite cookies with CSRF protection. No tokens in browser storage.' },
  { icon: Users, title: 'Role-based access', text: 'Owner, Admin, Engineer and Viewer roles enforced on every API request.' },
  { icon: FileLock2, title: 'Tenant isolation', text: 'Every record is scoped to an organization. Cross-organization access is rejected server-side.' },
  { icon: ShieldCheck, title: 'Hardened auth', text: 'Salted password hashing, single-use expiring reset links and rate-limited sign-in.' },
];

export default function Landing() {
  useDocumentTitle('');
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,#E3F5E9_0%,rgba(248,250,248,0)_100%)]" aria-hidden />
        <div className="container-page relative pb-16 pt-14 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700">
              <BrainCircuit className="h-3.5 w-3.5" /> AI-assisted reliability for data centers
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] text-ink sm:text-5xl lg:text-6xl">
              Predict Infrastructure Failures Before They Cause Downtime.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">
              VaultWatch watches your servers, racks and facilities, detects anomalies as they emerge and estimates which assets are likely to fail next, so your team fixes problems on its schedule, not at 3 a.m.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink to="/signup" size="lg" className="w-full sm:w-auto">Get Started Free <ArrowRight className="h-4 w-4" /></ButtonLink>
              <ButtonLink to="/#product" size="lg" variant="secondary" className="w-full sm:w-auto">Explore Platform</ButtonLink>
            </div>
            <p className="mt-4 text-xs text-ink-muted">14-day trial · No credit card · Explore with sample data</p>
          </div>
          <div id="product" className="mx-auto mt-14 max-w-5xl scroll-mt-24">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-line bg-white py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Platform</p>
            <h2 className="mt-2 text-3xl font-bold text-ink">One place for incidents, predictions and infrastructure health</h2>
            <p className="mt-3 text-ink-muted">Replace scattered dashboards and alert noise with a single view your whole operations team trusts.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-6 transition-shadow hover:shadow-pop">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/features" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">See all features <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-2 text-3xl font-bold text-ink">From telemetry to resolved incident in four steps</h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-line bg-white p-6">
                <span className="font-mono text-sm font-semibold text-brand">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* AI showcase */}
      <section id="ai" className="border-y border-line bg-white py-20">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">AI prediction and incident intelligence</p>
            <h2 className="mt-2 text-3xl font-bold text-ink">Know what will break, how sure we are, and what to do about it</h2>
            <p className="mt-4 text-ink-muted">Every prediction separates two numbers that are easy to confuse:</p>
            <ul className="mt-5 space-y-4">
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><span className="text-sm text-ink"><strong>Anomaly score</strong> ranks how unusual a server is right now. It is not a probability.</span></li>
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><span className="text-sm text-ink"><strong>Confidence</strong> tells you how much history backs the result, and suspected causes stay suspected until your team confirms them.</span></li>
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><span className="text-sm text-ink"><strong>Contributing factors</strong> and <strong>remediation steps</strong> explain the score so engineers can act on it.</span></li>
            </ul>
            <ButtonLink to="/features#predictive-analytics" variant="secondary" className="mt-7">How predictions work</ButtonLink>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Top predicted risks</p>
              <SampleBadge />
            </div>
            {[
              { t: 'Thermal overload · ash-a02-03', h: 'next 24 hours', p: 87, c: 92 },
              { t: 'Memory exhaustion · ash-b01-02', h: 'next 72 hours', p: 72, c: 88 },
              { t: 'Disk failure · ash-b03-04', h: 'next 7 days', p: 41, c: 77 },
            ].map((r) => (
              <div key={r.t} className="mt-4 rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{r.t}</p>
                    <p className="text-xs text-ink-muted">Likely in the {r.h}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-sm font-bold ${r.p > 80 ? 'bg-critical-bg text-critical' : r.p > 60 ? 'bg-orange-bg text-orange' : 'bg-warning-bg text-warning'}`}>{r.p}%</span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
                  <span className="w-24">Confidence</span>
                  <span className="h-1.5 flex-1 rounded-full bg-line"><span className="block h-1.5 rounded-full bg-brand" style={{ width: `${r.c}%` }} /></span>
                  <span className="w-8 text-right font-medium text-ink">{r.c}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Who it's for</p>
            <h2 className="mt-2 text-3xl font-bold text-ink">Built for the teams who keep infrastructure running</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {segments.map(({ icon: Icon, title, text }) => (
              <Link key={title} to="/solutions" className="card group p-6 transition-shadow hover:shadow-pop">
                <Icon className="h-6 w-6 text-brand" />
                <h3 className="mt-4 font-semibold text-ink group-hover:text-brand">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{text}</p>
              </Link>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-ink-muted">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Colocation</span>
            <span className="flex items-center gap-2"><Cloud className="h-4 w-4" /> Cloud and SaaS</span>
            <span className="flex items-center gap-2"><Network className="h-4 w-4" /> Telecom and edge</span>
            <span className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Enterprise IT</span>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-y border-line bg-white py-20">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-3">
            <div>
              <p className="eyebrow">Security and reliability</p>
              <h2 className="mt-2 text-3xl font-bold text-ink">Designed for sensitive operational data</h2>
              <p className="mt-3 text-sm leading-6 text-ink-muted">The platform is built around least-privilege access and server-side enforcement. Certifications and formal audits have not been completed yet.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
              {security.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-line p-5">
                  <Icon className="h-5 w-5 text-brand" />
                  <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Pricing</p>
            <h2 className="mt-2 text-3xl font-bold text-ink">Start free, scale when you're ready</h2>
          </div>
          <div className="mt-12"><PricingCards /></div>
          <div className="mt-6 text-center"><Link to="/pricing" className="text-sm font-medium text-brand hover:underline">Compare plans in detail</Link></div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-white py-20">
        <div className="container-page grid gap-10 lg:grid-cols-3">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2 className="mt-2 text-3xl font-bold text-ink">Frequently asked questions</h2>
            <p className="mt-3 text-sm text-ink-muted">Can't find what you need? <Link to="/contact" className="font-medium text-brand hover:underline">Contact us</Link>.</p>
          </div>
          <div className="lg:col-span-2"><Faq /></div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container-page">
          <div className="rounded-3xl bg-brand px-6 py-14 text-center sm:px-12">
            <h2 className="text-3xl font-bold text-white">See your riskiest assets in minutes</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">Create an account, explore the sample environment and connect your own infrastructure when you're ready.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink to="/signup" size="lg" variant="secondary">Get Started Free</ButtonLink>
              <ButtonLink to="/contact?subject=demo" size="lg" className="border border-white/30 bg-transparent text-white hover:bg-white/10">Talk to us</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
