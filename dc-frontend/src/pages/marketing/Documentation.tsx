import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, BookOpen, BrainCircuit, Code2, LayoutDashboard, Rocket, Search, Server, Siren } from 'lucide-react';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { EmptyState } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface Doc { id: string; icon: typeof Rocket; title: string; summary: string; articles: { title: string; body: string }[] }

const docs: Doc[] = [
  {
    id: 'getting-started', icon: Rocket, title: 'Getting Started', summary: 'Create an account, set up your organization and explore sample data.',
    articles: [
      { title: 'Create your account', body: 'Sign up with your work email, verify the address from the email we send, then complete the onboarding steps. You can skip onboarding and return to settings later.' },
      { title: 'Choose a monitoring setup', body: 'Pick the demo environment to explore with clearly labeled sample data, connect existing infrastructure, or configure an integration later.' },
      { title: 'Invite your team', body: 'Owners and admins can invite members from Team. Invitations expire after 7 days and can be resent or revoked.' },
      { title: 'Roles and permissions', body: 'Owner manages billing and everything else. Admin manages infrastructure, incidents, monitoring and engineers/viewers. Engineer works incidents. Viewer has read-only access.' },
    ],
  },
  {
    id: 'dashboard', icon: LayoutDashboard, title: 'Dashboard', summary: 'Read the health overview, trends and resource charts.',
    articles: [
      { title: 'Summary cards', body: 'Active incidents, total servers, estimated uptime and predicted high-risk assets update as incidents change.' },
      { title: 'Incident trend', body: 'Daily counts by severity for the selected range. Hover any bar for exact values.' },
      { title: 'Resource usage', body: 'Fleet averages for CPU, memory, network and storage. Switch metrics with the tabs above the chart.' },
    ],
  },
  {
    id: 'incidents', icon: Siren, title: 'Incidents', summary: 'Create, assign, acknowledge, resolve and reopen incidents.',
    articles: [
      { title: 'Incident lifecycle', body: 'Incidents move from Ongoing to Investigating when acknowledged, and to Resolved when fixed. Resolved incidents can be reopened with a reason.' },
      { title: 'Filtering and search', body: 'Filter by severity, status, rack and date range, or search by ID and title. Filters are kept in the URL so you can share a view.' },
      { title: 'AI analysis', body: 'Each incident shows a probable root cause, contributing factors and remediation suggestions. Sample analysis is labeled as such.' },
    ],
  },
  {
    id: 'predictions', icon: BrainCircuit, title: 'Predictions', summary: 'Understand risk scores, horizons and model confidence.',
    articles: [
      { title: 'Probability vs confidence', body: 'Probability is the chance of an incident within the horizon. Confidence is how reliable the model judges that estimate. Treat high probability with low confidence as a signal to investigate, not a certainty.' },
      { title: 'Time horizons', body: 'Predictions cover 6 hours, 24 hours, 72 hours and 7 days. Longer horizons are naturally less certain.' },
      { title: 'Sample predictions', body: 'Until a trained model is connected, predictions are sample data and are labeled with a Sample badge.' },
    ],
  },
  {
    id: 'infrastructure', icon: Server, title: 'Infrastructure', summary: 'Navigate data centers, racks and servers.',
    articles: [
      { title: 'Rack layout', body: 'Each rack shows its health and power use. Click a rack to see its servers, or a server to open its details.' },
      { title: 'Server metrics', body: 'CPU, memory, temperature, power and connectivity per server, with status rolled up to the rack.' },
    ],
  },
  {
    id: 'reports', icon: BarChart3, title: 'Reports', summary: 'Uptime, downtime, MTTR and exports.',
    articles: [
      { title: 'How uptime is estimated', body: 'Estimated availability counts server-hours lost to critical incidents (full outage) and major incidents (25% degradation) against total server-hours in the period.' },
      { title: 'Exporting CSV', body: 'Use Export CSV to download incidents in the selected range. Values that look like spreadsheet formulas are escaped.' },
    ],
  },
  {
    id: 'api', icon: Code2, title: 'API Integration', summary: 'Send telemetry and automate workflows.',
    articles: [
      { title: 'API keys', body: 'Owners and admins create organization-scoped API keys in Integrations. The full key is shown once; only a hash is stored on the server.' },
      { title: 'Ingesting metrics', body: 'POST /api/v1/metrics with a server_id and readings (cpu_pct, ram_pct, temp_celsius, disk_used_pct, net_mbps). Authenticate with the X-API-Key header.' },
      { title: 'Health endpoint', body: 'GET /health returns backend status and version. Use it for uptime checks of the platform itself.' },
    ],
  },
];

export default function Documentation() {
  useDocumentTitle('Documentation');
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return docs;
    return docs
      .map((d) => ({ ...d, articles: d.articles.filter((a) => (a.title + a.body).toLowerCase().includes(s) || d.title.toLowerCase().includes(s)) }))
      .filter((d) => d.articles.length > 0);
  }, [q]);

  return (
    <MarketingLayout>
      <section className="border-b border-line bg-white">
        <div className="container-page py-14 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-brand" />
          <h1 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">Documentation</h1>
          <p className="mt-2 text-ink-muted">Guides for setting up and using VaultWatch.</p>
          <div className="relative mx-auto mt-6 max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documentation" aria-label="Search documentation" className="field h-12 rounded-xl pl-10 text-base" />
          </div>
        </div>
      </section>
      <div className="container-page grid gap-8 py-12 lg:grid-cols-4">
        <nav className="hidden lg:block" aria-label="Documentation sections">
          <ul className="sticky top-24 space-y-1">
            {docs.map(({ id, title, icon: Icon }) => (
              <li key={id}><a href={`#${id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-white hover:text-ink"><Icon className="h-4 w-4" />{title}</a></li>
            ))}
          </ul>
        </nav>
        <div className="space-y-6 lg:col-span-3">
          {filtered.length === 0 && <div className="card"><EmptyState icon={<Search className="h-5 w-5" />} title="No results" description={`Nothing matches “${q}”. Try a different term or contact us.`} action={<Link to="/contact" className="text-sm font-medium text-brand">Contact support</Link>} /></div>}
          {filtered.map(({ id, icon: Icon, title, summary, articles }) => (
            <section key={id} id={id} className="card scroll-mt-24 p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand"><Icon className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-lg font-semibold text-ink">{title}</h2>
                  <p className="text-sm text-ink-muted">{summary}</p>
                </div>
              </div>
              <div className="mt-5 divide-y divide-line">
                {articles.map((a) => (
                  <article key={a.title} className="py-4 first:pt-0 last:pb-0">
                    <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-ink-muted">{a.body}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}
