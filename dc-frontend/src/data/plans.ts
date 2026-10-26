import type { PlanId } from '@/types/domain';

/**
 * ILLUSTRATIVE PRICING. Final pricing has not been decided. Edit these values in one place;
 * the marketing pricing page, onboarding and the billing screen all read from here.
 */
export const PRICING_IS_ILLUSTRATIVE = true;

export interface Plan {
  id: PlanId;
  name: string;
  price: number | null;
  priceNote: string;
  description: string;
  cta: string;
  highlighted?: boolean;
  limits: { servers: number; dataCenters: number; members: number; retentionDays: number; apiCallsPerDay: number };
  features: string[];
}

export const plans: Plan[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    price: 0,
    priceNote: 'for 14 days',
    description: 'Explore the full platform with sample data or a small environment.',
    cta: 'Start free trial',
    limits: { servers: 25, dataCenters: 1, members: 3, retentionDays: 7, apiCallsPerDay: 5_000 },
    features: ['Incident management', 'Anomaly detection', 'Sample prediction models', 'Email alerts', 'Community support'],
  },
  {
    id: 'team',
    name: 'Team',
    price: 499,
    priceNote: 'per month, billed annually',
    description: 'For operations teams running one or two facilities.',
    cta: 'Choose Team',
    highlighted: true,
    limits: { servers: 250, dataCenters: 2, members: 15, retentionDays: 30, apiCallsPerDay: 100_000 },
    features: ['Everything in Free Trial', 'Predictive risk scoring', 'Root-cause analysis', 'Slack and webhook alerts', 'CSV reports', 'Business-hours support'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 1499,
    priceNote: 'per month, billed annually',
    description: 'For multi-site operators and managed service providers.',
    cta: 'Choose Business',
    limits: { servers: 2_000, dataCenters: 10, members: 100, retentionDays: 365, apiCallsPerDay: 1_000_000 },
    features: ['Everything in Team', 'Multiple organizations', 'PagerDuty integration', 'SSO (SAML) readiness', 'Audit log export', 'Priority support'],
  },
];

export const comparison: { group: string; rows: { label: string; values: [string | boolean, string | boolean, string | boolean] }[] }[] = [
  {
    group: 'Limits',
    rows: [
      { label: 'Monitored servers', values: ['25', '250', '2,000'] },
      { label: 'Data centers', values: ['1', '2', '10'] },
      { label: 'Team members', values: ['3', '15', '100'] },
      { label: 'Metric retention', values: ['7 days', '30 days', '365 days'] },
      { label: 'API calls per day', values: ['5,000', '100,000', '1,000,000'] },
    ],
  },
  {
    group: 'Monitoring and AI',
    rows: [
      { label: 'Incident management', values: [true, true, true] },
      { label: 'Anomaly detection', values: [true, true, true] },
      { label: 'Predictive risk scoring', values: ['Sample only', true, true] },
      { label: 'Root-cause analysis', values: [false, true, true] },
      { label: 'Custom alert rules', values: ['5', 'Unlimited', 'Unlimited'] },
    ],
  },
  {
    group: 'Collaboration and security',
    rows: [
      { label: 'Role-based access', values: [true, true, true] },
      { label: 'Slack, webhook, PagerDuty', values: [false, 'Slack, webhook', true] },
      { label: 'Audit log export', values: [false, false, true] },
      { label: 'SSO (SAML)', values: [false, false, 'On request'] },
    ],
  },
];

export const planById = (id: PlanId) => plans.find((p) => p.id === id)!;
