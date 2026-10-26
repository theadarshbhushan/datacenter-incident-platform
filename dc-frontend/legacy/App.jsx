import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';

// Public
import Landing from './pages/marketing/Landing';
import Features from './pages/marketing/Features';
import Solutions from './pages/marketing/Solutions';
import Pricing from './pages/marketing/Pricing';
import Contact from './pages/marketing/Contact';
import Documentation from './pages/marketing/Documentation';
import Privacy from './pages/marketing/Privacy';
import Terms from './pages/marketing/Terms';

// Auth
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyEmail from './pages/auth/VerifyEmail';

// Onboarding
import Onboarding from './pages/onboarding/Onboarding';

// App
import Dashboard from './pages/app/Dashboard';
import Incidents from './pages/app/Incidents';
import IncidentDetail from './pages/app/IncidentDetail';
import Prediction from './pages/app/Prediction';
import Infrastructure from './pages/app/Infrastructure';
import Reports from './pages/app/Reports';
import Alerts from './pages/app/Alerts';
import Team from './pages/app/Team';
import Settings from './pages/app/Settings';
import Profile from './pages/app/Profile';
import Billing from './pages/app/Billing';
import Integrations from './pages/app/Integrations';
import NotFound from './pages/app/NotFound';

const isAuth = () => !!(localStorage.getItem('dc_token') || localStorage.getItem('token'));

const ProtectedRoute = ({ children }) => {
  if (!isAuth()) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
};

const PublicOnlyRoute = ({ children }) => {
  if (isAuth()) return <Navigate to="/app/dashboard" replace />;
  return children;
};

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public marketing */}
        <Route path="/" element={<Landing />} />
        <Route path="/features" element={<Features />} />
        <Route path="/solutions" element={<Solutions />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Auth */}
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/logout" element={<LogoutPage />} />

        {/* Onboarding */}
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

        {/* App */}
        <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/app/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
        <Route path="/app/incidents/:id" element={<ProtectedRoute><IncidentDetail /></ProtectedRoute>} />
        <Route path="/app/predictions" element={<ProtectedRoute><Prediction /></ProtectedRoute>} />
        <Route path="/app/infrastructure" element={<ProtectedRoute><Infrastructure /></ProtectedRoute>} />
        <Route path="/app/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/app/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
        <Route path="/app/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
        <Route path="/app/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/app/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/app/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
        <Route path="/app/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
        <Route path="/app/404" element={<NotFound />} />
        <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/app/404" replace />} />
      </Routes>
    </Router>
  );
}

function LogoutPage() {
  React.useEffect(() => {
    localStorage.removeItem('dc_token');
    localStorage.removeItem('token');
    localStorage.removeItem('dc_user');
    window.location.href = '/login';
  }, []);
  return null;
}
