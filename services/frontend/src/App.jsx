import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, AlertTriangle, ShieldCheck } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Incidents from './pages/Incidents';

const Layout = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Servers', path: '/servers', icon: Server },
    { name: 'Incidents', path: '/incidents', icon: AlertTriangle },
  ];

  return (
    <div className="flex h-screen bg-darkBg text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-panelBg border-r border-borderSlate flex flex-col z-20">
        <div className="h-16 flex items-center px-6 gap-3 border-b border-borderSlate">
          <ShieldCheck className="text-accentCyan w-8 h-8" />
          <div>
            <h1 className="font-extrabold text-sm tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-accentCyan to-accentEmerald">
              DC Incident NOC
            </h1>
            <span className="text-[10px] text-slate-500 font-medium">Prediction Platform</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-accentCyan/10 text-accentCyan border-l-2 border-accentCyan pl-3'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-accentCyan' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-borderSlate text-center text-[10px] text-slate-500 font-semibold">
          v1.0.0 &bull; Live Telemetry
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden bg-darkBg relative">
        {children}
      </main>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
