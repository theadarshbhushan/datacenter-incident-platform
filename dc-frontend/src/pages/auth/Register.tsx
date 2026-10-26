import { Navigate, useSearchParams } from 'react-router-dom';

/** /register is an alias entry point. Invitations go to their own flow; other params carry over to /signup. */
export default function Register() {
  const [params] = useSearchParams();
  const invite = params.get('invite') || params.get('invitation');
  if (invite) return <Navigate to={`/accept-invitation?token=${encodeURIComponent(invite)}`} replace />;
  const keep = new URLSearchParams();
  ['ref', 'plan', 'email', 'utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => { const v = params.get(k); if (v) keep.set(k, v); });
  const qs = keep.toString();
  return <Navigate to={`/signup${qs ? `?${qs}` : ''}`} replace />;
}
