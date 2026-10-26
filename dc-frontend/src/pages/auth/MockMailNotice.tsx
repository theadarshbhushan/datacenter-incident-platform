import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { api } from '@/services/api';
import { isMock } from '@/config/env';
import type { MailMessage } from '@/types/domain';
import { timeAgo } from '@/utils/format';

/**
 * Mock mode only: shows the message that a real deployment would have emailed, so flows can be
 * tested end to end. It says plainly that nothing was sent.
 */
export function MockMailNotice({ email, refreshKey = 0 }: { email?: string; refreshKey?: number }) {
  const [mail, setMail] = useState<MailMessage | null>(null);
  useEffect(() => {
    if (!isMock || !email) return;
    void api.listMail().then((list) => setMail(list.find((m) => m.to === email.toLowerCase()) ?? null));
  }, [email, refreshKey]);
  if (!isMock) return null;
  return (
    <div className="rounded-lg border border-dashed border-warning-line bg-warning-bg/60 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-warning"><Inbox className="h-4 w-4" /> Demo mode: no email was sent</p>
      {mail ? (
        <div className="mt-2 text-ink-muted">
          <p>The message that would be emailed to <span className="font-medium text-ink">{mail.to}</span> ({timeAgo(mail.createdAt)}):</p>
          <p className="mt-1 font-medium text-ink">{mail.subject}</p>
          <Link to={mail.link} className="mt-2 inline-block font-medium text-brand hover:underline">Open the link from this email</Link>
        </div>
      ) : (
        <p className="mt-1 text-ink-muted">If an account exists, its message appears in the <Link to="/dev/mailbox" className="font-medium text-brand hover:underline">developer mailbox</Link>.</p>
      )}
    </div>
  );
}
