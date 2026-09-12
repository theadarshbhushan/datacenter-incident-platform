import React, { useState } from 'react';
import {
  BarChart3,
  Calendar,
  TrendingDown,
  Clock,
  AlertTriangle,
  Server,
  Download,
  Filter,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import StatCard from '../components/StatCard';
import SeverityBadge from '../components/SeverityBadge';

const INCIDENT_TREND_7D = [
  { day: 'Mon', critical: 2, warning: 3, info: 5 },
  { day: 'Tue', critical: 1, warning: 4, info: 6 },
  { day: 'Wed', critical: 3, warning: 2, info: 4 },
  { day: 'Thu', critical: 0, warning: 2, info: 7 },
  { day: 'Fri', critical: 4, warning: 5, info: 8 },
  { day: 'Sat', critical: 1, warning: 1, info: 3 },
  { day: 'Sun', critical: 2, warning: 2, info: 4 },
];

const INCIDENT_TREND_30D = [
  { day: 'Week 1', critical: 8, warning: 14, info: 22 },
  { day: 'Week 2', critical: 5, warning: 11, info: 18 },
  { day: 'Week 3', critical: 12, warning: 16, info: 25 },
  { day: 'Week 4', critical: 6, warning: 9, info: 19 },
];

const INCIDENT_TYPE_DISTRIBUTION = [
  { name: 'CPU Spike', value: 42, color: '#DA1E28' },
  { name: 'Memory Leak', value: 26, color: '#8A3FFC' },
  { name: 'Thermal Runaway', value: 18, color: '#FF832B' },
  { name: 'Network Congestion', value: 14, color: '#0F62FE' },
];

const ANOMALY_SCORE_HISTORY = [
  { time: '00:00', score: 0.18 },
  { time: '03:00', score: 0.14 },
  { time: '06:00', score: 0.22 },
  { time: '09:00', score: 0.58 },
  { time: '12:00', score: 0.88 },
  { time: '15:00', score: 0.65 },
  { time: '18:00', score: 0.42 },
  { time: '21:00', score: 0.25 },
];

const PROBLEMATIC_SERVERS = [
  { rank: 1, hostname: 'server-001', rack: 'Rack-A (U12)', incidents: 14, mttr: '12.4 min', uptime: '97.2%', status: 'critical' },
  { rank: 2, hostname: 'server-008', rack: 'Rack-B (U04)', incidents: 9, mttr: '15.8 min', uptime: '98.5%', status: 'high' },
  { rank: 3, hostname: 'server-014', rack: 'Rack-C (U18)', incidents: 6, mttr: '8.2 min', uptime: '99.1%', status: 'medium' },
  { rank: 4, hostname: 'server-022', rack: 'Rack-B (U21)', incidents: 4, mttr: '11.0 min', uptime: '99.4%', status: 'low' },
  { rank: 5, hostname: 'server-030', rack: 'Rack-D (U08)', incidents: 3, mttr: '14.1 min', uptime: '99.6%', status: 'low' },
];

export const Analytics = () => {
  const [timeRange, setTimeRange] = useState('7d'); // '7d' | '30d' | '90d'

  const trendData = timeRange === '30d' ? INCIDENT_TREND_30D : INCIDENT_TREND_7D;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header & Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
            Historical Incident Analytics
          </h1>
          <p className="text-xs text-[#525252] mt-0.5">
            Macro reliability metrics, failure frequency distributions, and MTTR performance
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#F4F4F4] p-0.5 rounded-[3px] border border-[#E0E0E0] text-xs">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 rounded-[2px] font-medium transition-colors ${
                timeRange === '7d'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1.5 rounded-[2px] font-medium transition-colors ${
                timeRange === '30d'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setTimeRange('90d')}
              className={`px-3 py-1.5 rounded-[2px] font-medium transition-colors ${
                timeRange === '90d'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              Last 90 Days
            </button>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Incidents"
          value="48"
          icon={AlertTriangle}
          trend="-18% vs Last Period"
          trendDirection="down"
          subtitle="Cluster-wide count"
        />
        <StatCard
          title="Mean Time to Resolve (MTTR)"
          value="12.8 min"
          icon={Clock}
          trend="-4.2 min faster"
          trendDirection="down"
          subtitle="Target SLA: < 15.0 min"
        />
        <StatCard
          title="Automated Triaged Rate"
          value="89.4%"
          icon={BarChart3}
          trend="+6.1% with SHAP"
          trendDirection="up"
          subtitle="Zero manual tag required"
        />
        <StatCard
          title="Fleet Health Uptime"
          value="99.94%"
          icon={Server}
          trend="Nominal SLA"
          trendDirection="up"
          subtitle="No P0 cluster outages"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Daily Incident Trend BarChart */}
        <div className="card p-6 bg-white lg:col-span-2">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E0E0E0]">
            <div>
              <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
                Incident Volume by Severity ({timeRange.toUpperCase()})
              </h2>
              <p className="text-xs text-[#525252] mt-0.5">
                Stacked incident frequency across severity tiers
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-[#DA1E28] font-medium">● Critical</span>
              <span className="flex items-center gap-1 text-[#FF832B] font-medium">● Warning</span>
              <span className="flex items-center gap-1 text-[#0F62FE] font-medium">● Info</span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6F6F6F' }} tickLine={false} axisLine={{ stroke: '#E0E0E0' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6F6F6F' }} tickLine={false} axisLine={{ stroke: '#E0E0E0' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E0E0E0',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="critical" name="Critical" stackId="a" fill="#DA1E28" radius={[0, 0, 0, 0]} />
                <Bar dataKey="warning" name="Warning" stackId="a" fill="#FF832B" />
                <Bar dataKey="info" name="Info" stackId="a" fill="#0F62FE" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incident Type Donut Chart */}
        <div className="card p-6 bg-white flex flex-col justify-between">
          <div className="pb-3 mb-2 border-b border-[#E0E0E0]">
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Root Cause Classification
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Breakdown by XGBoost incident type
            </p>
          </div>

          <div className="h-52 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={INCIDENT_TYPE_DISTRIBUTION}
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {INCIDENT_TYPE_DISTRIBUTION.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => [`${val}%`, 'Incidents']}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E0E0E0',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#F4F4F4]">
            {INCIDENT_TYPE_DISTRIBUTION.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[#525252] truncate">{item.name} ({item.value}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Historical Anomaly Score Trend */}
      <div className="card p-6 bg-white">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E0E0E0]">
          <div>
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Fleet Average Anomaly Score Trajectory
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Isolation Forest aggregated score across all 36 nodes over 24-hour cycle
            </p>
          </div>
          <span className="text-xs font-mono text-[#525252] bg-[#F4F4F4] px-2 py-0.5 rounded">
            Anomaly Threshold = 0.70
          </span>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ANOMALY_SCORE_HISTORY} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DA1E28" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0F62FE" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#6F6F6F' }} tickLine={false} axisLine={{ stroke: '#E0E0E0' }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: '#6F6F6F' }} tickLine={false} axisLine={{ stroke: '#E0E0E0' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E0E0E0',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              />
              <Area type="monotone" dataKey="score" stroke="#DA1E28" strokeWidth={2} fillOpacity={1} fill="url(#scoreGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Most Problematic Servers Ranking Table */}
      <div className="card bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E0E0E0]">
          <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
            Most Problematic Nodes (Reliability Deficit Ranking)
          </h2>
          <p className="text-xs text-[#525252] mt-0.5">
            Nodes ranked by incident count, MTTR remediation latency, and SLA degradation
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F4F4F4] text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
                <th className="py-2.5 px-4">Rank</th>
                <th className="py-2.5 px-4">Server Hostname</th>
                <th className="py-2.5 px-4">Rack & Location</th>
                <th className="py-2.5 px-4">Incidents Logged</th>
                <th className="py-2.5 px-4">Mean MTTR</th>
                <th className="py-2.5 px-4">Availability</th>
                <th className="py-2.5 px-4">Risk Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0] text-xs">
              {PROBLEMATIC_SERVERS.map((srv) => (
                <tr key={srv.rank} className="hover:bg-[#F4F4F4] transition-colors">
                  <td className="py-3 px-4 font-bold text-[#525252]">#{srv.rank}</td>
                  <td className="py-3 px-4 font-mono font-bold text-[#0F62FE]">{srv.hostname}</td>
                  <td className="py-3 px-4 text-[#525252]">{srv.rack}</td>
                  <td className="py-3 px-4 font-bold text-[#161616]">{srv.incidents} incidents</td>
                  <td className="py-3 px-4 font-mono text-[#525252]">{srv.mttr}</td>
                  <td className="py-3 px-4 font-semibold text-[#24A148]">{srv.uptime}</td>
                  <td className="py-3 px-4">
                    <SeverityBadge severity={srv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
