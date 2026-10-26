import type { ReactNode } from 'react';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { Callout } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { config } from '@/config/env';

/** Editable placeholders. Replace before publishing; nothing here has been reviewed by a lawyer. */
const company = {
  legalName: '[Company legal name]',
  address: '[Registered address]',
  jurisdiction: '[Governing jurisdiction]',
  email: config.supportEmail,
  effectiveDate: '[Effective date]',
};

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <MarketingLayout>
      <div className="container-page max-w-3xl py-14">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-2 text-3xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">Effective date: {company.effectiveDate}</p>
        <Callout tone="warning" title="Draft document" className="mt-6">
          This is a draft template with placeholder company details. It has not been reviewed by legal counsel and is not yet a binding policy. Replace the bracketed fields and have it reviewed before launch.
        </Callout>
        <div className="prose-legal mt-8">{children}</div>
      </div>
    </MarketingLayout>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This Privacy Policy explains how {company.legalName} ("we", "us") collects, uses and protects information when you use VaultWatch.</p>
      <h2>Information we collect</h2>
      <ul>
        <li>Account information: name, work email, organization name and role.</li>
        <li>Operational telemetry you choose to send, such as server metrics and incident records.</li>
        <li>Usage information such as sign-in times, device and browser type, used to secure your account.</li>
      </ul>
      <h2>How we use information</h2>
      <ul>
        <li>To provide, maintain and secure the service.</li>
        <li>To send service emails such as verification, password reset and invitations.</li>
        <li>To generate analytics and predictions for your organization only.</li>
      </ul>
      <h2>Sharing</h2>
      <p>We do not sell personal information. We share data only with service providers needed to run the service, under contract, or when required by law.</p>
      <h2>Retention</h2>
      <p>Telemetry is kept for the retention period of your plan. Account data is kept while your account is active and deleted on request, subject to legal obligations.</p>
      <h2>Your rights</h2>
      <p>Depending on your location you may have rights to access, correct, export or delete your data. Contact us at {company.email}.</p>
      <h2>Contact</h2>
      <p>{company.legalName}, {company.address}. Email: {company.email}.</p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>These Terms govern your use of VaultWatch, provided by {company.legalName}. By creating an account you agree to them.</p>
      <h2>Accounts</h2>
      <p>You are responsible for your account credentials and for activity in organizations you manage. Notify us promptly of unauthorized use.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not attempt to access other organizations' data.</li>
        <li>Do not disrupt or overload the service or bypass rate limits.</li>
        <li>Send only data you have the right to process.</li>
      </ul>
      <h2>Predictions and analysis</h2>
      <p>Predictions, risk scores and root-cause suggestions are estimates to support your decisions. They are not guarantees, and you remain responsible for operational decisions.</p>
      <h2>Plans and payment</h2>
      <p>Pricing shown on the website is illustrative until published. No charges are made without a configured billing agreement.</p>
      <h2>Termination</h2>
      <p>You may stop using the service at any time. We may suspend accounts that violate these Terms.</p>
      <h2>Liability</h2>
      <p>[Limitation of liability clause to be drafted by counsel.]</p>
      <h2>Governing law</h2>
      <p>These Terms are governed by the laws of {company.jurisdiction}.</p>
    </LegalPage>
  );
}
