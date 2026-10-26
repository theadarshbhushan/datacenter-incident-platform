import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, RotateCcw } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Callout, ConfirmDialog, EmptyState } from '@/components/ui';
import { api } from '@/services/api';
import { DEMO_EXPIRED_RESET_TOKEN, DEMO_EXPIRED_VERIFY_TOKEN, resetMockDatabase } from '@/services/mockApi';
import type { MailMessage } from '@/types/domain';
import { timeAgo } from '@/utils/format';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** Mock mode only. Shows messages a real deployment would have emailed. */
export default function DevMailbox() {
  useDocumentTitle('Developer mailbox');
  const [mail, setMail] = useState<MailMessage[]>([]);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { void api.listMail().then(setMail); }, []);
  return (
    <AuthLayout title="Developer mailbox" subtitle="Demo mode doesn't send email. Messages that would have been sent appear here so you can test every flow.">
      <div className="space-y-4">
        <div className="card divide-y divide-line">
          {mail.length === 0 && <EmptyState icon={<Inbox className="h-5 w-5" />} title="No messages yet" description="Sign up, request a password reset or invite a teammate." />}
          {mail.map((m) => (
            <div key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-ink">{m.subject}</p>
                <span className="shrink-0 text-xs text-ink-faint">{timeAgo(m.createdAt)}</span>
              </div>
              <p className="text-xs text-ink-muted">To {m.to}</p>
              <p className="mt-1 text-sm text-ink-muted">{m.body}</p>
              <Link to={m.link} className="mt-2 inline-block text-sm font-medium text-brand hover:underline">Open link</Link>
            </div>
          ))}
        </div>
        <Callout tone="info" title="Test expired links">
          <Link className="text-brand hover:underline" to={`/reset-password?token=${DEMO_EXPIRED_RESET_TOKEN}`}>Expired reset link</Link>
          {' · '}
          <Link className="text-brand hover:underline" to={`/verify-email?token=${DEMO_EXPIRED_VERIFY_TOKEN}`}>Expired verification link</Link>
          {' · '}
          <Link className="text-brand hover:underline" to="/reset-password?token=not-a-real-token">Invalid reset link</Link>
          {' · '}
          <Link className="text-brand hover:underline" to="/accept-invitation?token=not-a-real-token">Invalid invitation</Link>
        </Callout>
        <Button variant="outline-danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirm(true)}>Reset demo data</Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        destructive
        title="Reset all demo data?"
        description="This deletes every mock account, organization and change stored in this browser and signs you out. Demo accounts are recreated."
        confirmLabel="Reset demo data"
        onConfirm={async () => { await resetMockDatabase(); window.location.assign('/login'); }}
      />
    </AuthLayout>
  );
}
