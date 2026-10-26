import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '@/components/ui';

/** Ends the server session, clears client state and returns to the sign-in page. */
export default function Logout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    logout().finally(() => navigate('/login', { replace: true }));
  }, [logout, navigate]);
  return <div className="min-h-screen bg-canvas"><PageLoader label="Signing you out…" /></div>;
}
