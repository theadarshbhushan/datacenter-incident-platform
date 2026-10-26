import { Link } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { isMock } from '@/config/env';

/** Always-visible notice that the app is running against the in-browser mock backend. */
export function MockBanner() {
  if (!isMock) return null;
  return (
    <div className="border-b border-warning-line bg-warning-bg px-4 py-1.5 text-center text-xs text-warning">
      <FlaskConical className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
      Demo mode: data is stored in this browser, emails are not sent and predictions are sample data.{' '}
      <Link to="/dev/mailbox" className="font-medium underline underline-offset-2">Open developer mailbox</Link>
    </div>
  );
}
