import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { PublicOnly, RequireAuth, RequirePermission, RequireReady } from './guards';
import { isMock } from '@/config/env';

const Landing = lazy(() => import('@/pages/marketing/Landing'));
const Features = lazy(() => import('@/pages/marketing/Features'));
const Solutions = lazy(() => import('@/pages/marketing/Solutions'));
const Pricing = lazy(() => import('@/pages/marketing/Pricing'));
const Contact = lazy(() => import('@/pages/marketing/Contact'));
const Documentation = lazy(() => import('@/pages/marketing/Documentation'));
const Privacy = lazy(() => import('@/pages/marketing/Legal').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('@/pages/marketing/Legal').then((m) => ({ default: m.Terms })));

const Login = lazy(() => import('@/pages/auth/Login'));
const Signup = lazy(() => import('@/pages/auth/Signup'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'));
const AcceptInvitation = lazy(() => import('@/pages/auth/AcceptInvitation'));
const Logout = lazy(() => import('@/pages/auth/Logout'));
const DevMailbox = lazy(() => import('@/pages/auth/DevMailbox'));

const Onboarding = lazy(() => import('@/pages/onboarding/Onboarding'));

const Dashboard = lazy(() => import('@/pages/app/Dashboard'));
const Incidents = lazy(() => import('@/pages/app/Incidents'));
const IncidentDetail = lazy(() => import('@/pages/app/IncidentDetail'));
const Predictions = lazy(() => import('@/pages/app/Predictions'));
const Infrastructure = lazy(() => import('@/pages/app/Infrastructure'));
const Reports = lazy(() => import('@/pages/app/Reports'));
const Alerts = lazy(() => import('@/pages/app/Alerts'));
const Team = lazy(() => import('@/pages/app/Team'));
const Settings = lazy(() => import('@/pages/app/Settings'));
const Profile = lazy(() => import('@/pages/app/Profile'));
const Billing = lazy(() => import('@/pages/app/Billing'));
const Integrations = lazy(() => import('@/pages/app/Integrations'));
const NotFound = lazy(() => import('@/pages/app/NotFound'));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas"><PageLoader /></div>}>
      <Routes>
        {/* Public website */}
        <Route path="/" element={<Landing />} />
        <Route path="/features" element={<Features />} />
        <Route path="/solutions" element={<Solutions />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Authentication and recovery */}
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/logout" element={<Logout />} />
        {isMock && <Route path="/dev/mailbox" element={<DevMailbox />} />}

        {/* Onboarding */}
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

        {/* Authenticated application */}
        <Route path="/app" element={<RequireAuth />}>
          <Route element={<RequireReady />}>
            <Route element={<WorkspaceProvider><AppShell /></WorkspaceProvider>}>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<S><Dashboard /></S>} />
              <Route path="incidents" element={<S><Incidents /></S>} />
              <Route path="incidents/:incidentId" element={<S><IncidentDetail /></S>} />
              <Route path="predictions" element={<S><Predictions /></S>} />
              <Route path="predictions/:predictionId" element={<S><Predictions /></S>} />
              <Route path="infrastructure" element={<S><Infrastructure /></S>} />
              <Route path="reports" element={<S><Reports /></S>} />
              <Route path="alerts" element={<S><Alerts /></S>} />
              <Route path="team" element={<S><Team /></S>} />
              <Route path="settings" element={<S><Settings /></S>} />
              <Route path="settings/:section" element={<S><Settings /></S>} />
              <Route path="profile" element={<S><Profile /></S>} />
              <Route path="billing" element={<S><RequirePermission permission="billing:view"><Billing /></RequirePermission></S>} />
              <Route path="integrations" element={<S><RequirePermission permission="integrations:manage"><Integrations /></RequirePermission></S>} />
              <Route path="404" element={<S><NotFound inApp /></S>} />
              <Route path="*" element={<Navigate to="/app/404" replace />} />
            </Route>
          </Route>
        </Route>

        <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
