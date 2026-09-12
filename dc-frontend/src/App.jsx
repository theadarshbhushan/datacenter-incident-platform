import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Incidents from './pages/Incidents';
import Predictions from './pages/Predictions';
import AIExplanation from './pages/AIExplanation';
import Analytics from './pages/Analytics';
import ModelPerformance from './pages/ModelPerformance';
import AlertCenter from './pages/AlertCenter';
import Topology from './pages/Topology';

// Auth Protection wrapper
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('dc_token') || localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
};

export const App = () => {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Enterprise NOC Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/servers"
          element={
            <ProtectedRoute>
              <Servers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/incidents"
          element={
            <ProtectedRoute>
              <Incidents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/predictions"
          element={
            <ProtectedRoute>
              <Predictions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-explanation"
          element={
            <ProtectedRoute>
              <AIExplanation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/model-performance"
          element={
            <ProtectedRoute>
              <ModelPerformance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/alerts"
          element={
            <ProtectedRoute>
              <AlertCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/topology"
          element={
            <ProtectedRoute>
              <Topology />
            </ProtectedRoute>
          }
        />

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
