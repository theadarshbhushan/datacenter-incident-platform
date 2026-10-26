import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, AlertTriangle, TrendingUp, Server, BarChart2, Bell, Settings, Menu, X, Search, User, ChevronDown, LogOut, CreditCard, Users, Plug } from 'lucide-react';

const nav = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/incidents', icon: AlertTriangle, label: 'Incidents' },
  { to: '/app/predictions', icon: TrendingUp, label: 'Prediction' },
  { to: '/app/infrastructure', icon: Server, label: 'Infrastructure' },
  { to: '/app/reports', icon: BarChart2, label: 'Reports' },
  { to: '/app/alerts', icon: Bell, label: 'Alerts' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
];

export default function AppShell({ children }) {
  const [sideOpen, setSideOpen] = useState(true);
  const [userOpen, setUserOpen] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('dc_user') || '{"name":"Adarsh","email":"admin@datacenter.ai","role":"Admin"}');

  return (
    <div className="flex h-screen bg-[#F8FAF8] overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sideOpen ? 'w-56' : 'w-0 overflow-hidden'} transition-all duration-200 bg-white border-r border-gray-100 flex flex-col flex-shrink-0`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
          <div className="w-7 h-7 bg-green-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <span className="font-bold text-sm text-gray-900">DataCenterAI</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
          <div className="pt-4 border-t border-gray-100 mt-4 space-y-0.5">
            <NavLink to="/app/team" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Users size={16} /><span>Team</span>
            </NavLink>
            <NavLink to="/app/integrations" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Plug size={16} /><span>Integrations</span>
            </NavLink>
            <NavLink to="/app/billing" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <CreditCard size={16} /><span>Billing</span>
            </NavLink>
          </div>
        </nav>
        <div className="px-3 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => navigate('/app/profile')}>
            <div className="w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user.name?.[0] || 'A'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{user.name}</div>
              <div className="text-xs text-gray-500">{user.role}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-3 flex-shrink-0">
          <button onClick={() => setSideOpen(!sideOpen)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
            {sideOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex-1 max-w-md relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-green-400" placeholder="Search servers, incidents, racks..." />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Live
            </div>
            <button className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500" onClick={() => navigate('/app/alerts')}>
              <Bell size={17} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
            <div className="relative">
              <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100" onClick={() => setUserOpen(!userOpen)}>
                <div className="w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold">{user.name?.[0]||'A'}</div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-medium text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.role}</div>
                </div>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              {userOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1">
                  <button onClick={() => { setUserOpen(false); navigate('/app/profile'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><User size={14} />Profile</button>
                  <button onClick={() => { setUserOpen(false); navigate('/app/settings'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Settings size={14} />Settings</button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button onClick={() => navigate('/logout')} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><LogOut size={14} />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
