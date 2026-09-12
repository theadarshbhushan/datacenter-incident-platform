import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  AlertOctagon,
  TrendingUp,
  Brain,
  Bell,
  BarChart3,
  Gauge,
  Network,
  LogOut,
  Search,
  Activity,
  Layers,
  ChevronRight,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Command Center', icon: LayoutDashboard },
  { path: '/servers', label: 'Server Inventory', icon: Server },
  { path: '/incidents', label: 'Incident Center', icon: AlertOctagon },
  { path: '/predictions', label: 'Incident Prediction', icon: TrendingUp },
  { path: '/ai-explanation', label: 'AI Root Cause Analysis', icon: Brain },
  { path: '/alerts', label: 'Alert Center', icon: Bell },
  { path: '/analytics', label: 'Historical Analytics', icon: BarChart3 },
  { path: '/model-performance', label: 'Model Performance', icon: Gauge },
  { path: '/topology', label: 'DC Topology', icon: Network },
];

export const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadAlerts, setUnreadAlerts] = useState(3);
  const [searchQuery, setSearchQuery] = useState('');

  // WebSocket connection for real-time status pill
  const { isConnected } = useWebSocket((msg) => {
    if (msg.type === 'alert' || msg.type === 'incident') {
      setUnreadAlerts((prev) => prev + 1);
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('dc_token');
    localStorage.removeItem('token');
    localStorage.removeItem('dc_user');
    navigate('/login');
  };

  const storedUser = JSON.parse(localStorage.getItem('dc_user') || '{"name": "Site Reliability Engineer", "role": "Lead SRE"}');

  // Derive current breadcrumb title
  const currentNav = NAV_ITEMS.find((item) => item.path === location.pathname);
  const pageTitle = currentNav ? currentNav.label : 'Data Center Console';

  return (
    <div className="min-h-screen bg-[#F4F4F4] flex flex-col antialiased text-[#161616]">
      {/* 48px Top Navigation Bar */}
      <header className="h-12 bg-white border-b border-[#E0E0E0] sticky top-0 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2 font-bold text-sm tracking-tight text-[#161616]">
            <div className="w-6 h-6 rounded-[3px] bg-[#0F62FE] text-white flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm">DC-SENTINEL</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-[#EDF5FF] text-[#0F62FE] font-bold rounded-[2px]">
              SRE PRO
            </span>
          </div>

          <div className="h-4 w-px bg-[#E0E0E0]" />

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-[#525252]">
            <span>Console</span>
            <ChevronRight className="w-3 h-3 text-[#8D8D8D]" />
            <span className="font-semibold text-[#161616]">{pageTitle}</span>
          </div>
        </div>

        {/* Center Search bar */}
        <div className="hidden md:flex items-center relative w-96">
          <Search className="w-3.5 h-3.5 absolute left-3 text-[#525252]" />
          <input
            type="text"
            placeholder="Search servers, incidents, metrics (Press / to search)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1 text-xs bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] focus:bg-white focus:outline-none focus:border-[#0F62FE] transition-colors"
          />
          <kbd className="absolute right-2.5 text-[10px] font-mono text-[#8D8D8D] bg-white border border-[#E0E0E0] px-1 rounded">
            /
          </kbd>
        </div>

        {/* Right tools: WS status, notification bell, user & logout */}
        <div className="flex items-center gap-3">
          {/* Live WS Status Pill */}
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-[2px] border ${
              isConnected
                ? 'bg-[#DEFBE6] text-[#198038] border-[#A7F0BA]'
                : 'bg-[#FFF1F1] text-[#DA1E28] border-[#FFD7D9]'
            }`}
            title={isConnected ? 'Real-time telemetry stream active' : 'Offline / Reconnecting'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-[#24A148] animate-pulse' : 'bg-[#DA1E28]'
              }`}
            />
            <span className="font-semibold text-[11px]">
              {isConnected ? '● LIVE' : '○ OFFLINE'}
            </span>
          </div>

          {/* Notifications */}
          <button
            onClick={() => navigate('/alerts')}
            className="relative p-1.5 text-[#525252] hover:text-[#161616] hover:bg-[#F4F4F4] rounded-[3px] transition-colors"
            title="Alert Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadAlerts > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#DA1E28] text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadAlerts > 9 ? '9+' : unreadAlerts}
              </span>
            )}
          </button>

          <div className="h-4 w-px bg-[#E0E0E0]" />

          {/* User Profile & Logout */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#0F62FE] text-white font-semibold text-xs flex items-center justify-center">
              {storedUser.name ? storedUser.name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="hidden lg:block text-left text-xs leading-tight">
              <p className="font-medium text-[#161616] truncate max-w-[120px]">{storedUser.name || 'SRE Lead'}</p>
              <p className="text-[10px] text-[#525252] truncate max-w-[120px]">{storedUser.role || 'US-East-1'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-[#525252] hover:text-[#DA1E28] hover:bg-[#F4F4F4] rounded-[3px] transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container: 240px Fixed Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-[#E0E0E0] flex flex-col justify-between flex-shrink-0 z-30">
          <div className="py-3">
            <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#525252]">
              Operations Console
            </div>
            <nav className="space-y-0.5 px-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-[3px] text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#EDF5FF] text-[#0F62FE] border-l-4 border-[#0F62FE] font-semibold pl-2'
                        : 'text-[#525252] hover:bg-[#F4F4F4] hover:text-[#161616]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#0F62FE]' : 'text-[#525252]'}`} />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer System Health */}
          <div className="p-3 m-2 rounded-[4px] bg-[#F4F4F4] border border-[#E0E0E0] text-xs">
            <div className="flex items-center justify-between font-semibold text-[#161616] mb-1">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#24A148]" />
                Cluster Status
              </span>
              <span className="text-[10px] text-[#24A148] font-bold">OPTIMAL</span>
            </div>
            <p className="text-[11px] text-[#525252] leading-tight">
              34 nodes active in us-east-1a & 1b. Telemetry stream synchronized.
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
