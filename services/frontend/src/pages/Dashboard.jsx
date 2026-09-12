import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server,
  AlertTriangle,
  Activity,
  Cpu,
  Brain,
  TrendingUp,
  HardDrive,
  Clock,
  CheckCircle2,
  ExternalLink,
  X,
  RefreshCw,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { serversAPI, metricsAPI, incidentsAPI } from '../services/api';
import useWebSocket from '../hooks/useWebSocket';
import StatCard from '../components/StatCard';
import SeverityBadge from '../components/SeverityBadge';
import MetricBar from '../components/MetricBar';
import LoadingSpinner from '../components/LoadingSpinner';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [metricsMap, setMetricsMap] = useState({});
  const [timelineData, setTimelineData] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [activeMetricTab, setActiveMetricTab] = useState('all'); // 'all' | 'cpu' | 'ram' | 'temp'
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Generate 60 baseline timeline data points
  const generateInitialTimeline = (baseServerId = 'server-001') => {
    const points = [];
    const now = Date.now();
    for (let i = 59; i >= 0; i--) {
      const time = new Date(now - i * 5000);
      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      // subtle random walk
      const baseCpu = 65 + Math.sin(i / 5) * 15 + Math.random() * 5;
      const baseRam = 72 + Math.cos(i / 6) * 10 + Math.random() * 4;
      const baseTemp = 68 + Math.sin(i / 7) * 8 + Math.random() * 3;
      points.push({
        time: timeStr,
        timestamp: time.getTime(),
        cpu_pct: Number(Math.min(Math.max(baseCpu, 15), 98).toFixed(1)),
        ram_pct: Number(Math.min(Math.max(baseRam, 25), 96).toFixed(1)),
        temperature: Number(Math.min(Math.max(baseTemp, 45), 92).toFixed(1)),
        server_id: baseServerId,
      });
    }
    return points;
  };

  // Fetch initial data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [serversRes, incidentsRes] = await Promise.all([
        serversAPI.getServers(),
        incidentsAPI.getIncidents(),
      ]);

      setServers(serversRes);
      setIncidents(incidentsRes);

      // Initialize metric map for all servers
      const initialMap = {};
      serversRes.forEach((s) => {
        initialMap[s.hostname] = {
          cpu_pct: s.cpu_pct || 65 + Math.floor(Math.random() * 20),
          ram_pct: s.ram_pct || 70 + Math.floor(Math.random() * 15),
          temperature: s.temperature || 68 + Math.floor(Math.random() * 14),
          disk_pct: s.disk_pct || 55,
          timestamp: new Date().toISOString(),
        };
      });
      setMetricsMap(initialMap);

      // Set initial timeline for the first server
      const firstServer = serversRes[0] || { hostname: 'server-001' };
      setTimelineData(generateInitialTimeline(firstServer.hostname));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // WebSocket real-time updates
  const handleWebSocketMessage = useCallback((msg) => {
    if (msg.type === 'metric') {
      const m = msg.data;
      const sId = m.server_id;

      // Update server metric in map
      setMetricsMap((prev) => ({
        ...prev,
        [sId]: m,
      }));

      // If matches currently focused server or server-001, append to timeline
      setTimelineData((prev) => {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const newPoint = {
          time: timeStr,
          timestamp: Date.now(),
          cpu_pct: m.cpu_pct,
          ram_pct: m.ram_pct,
          temperature: m.temperature,
          server_id: sId,
        };
        const next = [...prev, newPoint];
        if (next.length > 60) next.shift();
        return next;
      });
    } else if (msg.type === 'incident') {
      const { action, data: inc } = msg;
      if (action === 'create') {
        setIncidents((prev) => [inc, ...prev]);
      } else if (action === 'update') {
        setIncidents((prev) => prev.map((item) => (item.id === inc.id ? inc : item)));
      }
    }
  }, []);

  useWebSocket(handleWebSocketMessage);

  const handleAcknowledgeIncident = async (id, e) => {
    e.stopPropagation();
    try {
      await incidentsAPI.acknowledgeIncident(id, 'Acknowledged from Dashboard NOC');
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === id ? { ...inc, status: 'acknowledged' } : inc))
      );
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  const openServerDrawer = (server) => {
    setSelectedServer(server);
    setDrawerOpen(true);
  };

  // KPI Calculations
  const totalServers = servers.length || 36;
  const anomalousCount = servers.filter((s) => s.status === 'anomalous' || s.status === 'critical').length || 2;
  const healthyCount = totalServers - anomalousCount;
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const criticalIncidentsCount = activeIncidents.filter((i) => i.severity === 'critical').length;
  const warningIncidentsCount = activeIncidents.filter((i) => i.severity === 'high' || i.severity === 'medium').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
            Data Center Command Center
          </h1>
          <p className="text-xs text-[#525252] mt-0.5">
            US-East-1 Cluster Infrastructure · Real-Time Bi-LSTM Telemetry Stream
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadDashboardData()}
            className="btn-secondary text-xs flex items-center gap-1.5"
            title="Refresh metrics snapshot"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#525252]" />
            <span>Sync Telemetry</span>
          </button>
          <button
            onClick={() => navigate('/predictions')}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Outage Predictions</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Servers"
          value={`${healthyCount} / ${totalServers}`}
          icon={Server}
          trend="+94.4% Nominal"
          trendDirection="up"
          subtitle="2 under maintenance"
        />
        <StatCard
          title="Outage Risk"
          value="1 Node Alert"
          icon={AlertTriangle}
          trend="87.4% Risk Level"
          trendDirection="up"
          trendInverted={true}
          subtitle="server-001 (Bi-LSTM spike)"
          className="border-l-4 border-l-[#DA1E28]"
        />
        <StatCard
          title="Active Incidents"
          value={`${criticalIncidentsCount} Critical`}
          icon={Activity}
          trend={`${warningIncidentsCount} Warnings`}
          trendDirection="neutral"
          subtitle="Avg MTTR: 14.2 mins"
        />
        <StatCard
          title="Model Status"
          value="Bi-LSTM + SHAP"
          icon={Brain}
          trend="96.2% Accuracy"
          trendDirection="up"
          subtitle="Temporal Attention 60-step"
        />
      </div>

      {/* Real-time Telemetry Timeline Recharts LineChart */}
      <div className="card p-5 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-[#E0E0E0] gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
                Telemetry Stream Timeline (Last 60 Steps)
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-[#EDF5FF] text-[#0F62FE] font-bold rounded">
                5s Interval
              </span>
            </div>
            <p className="text-xs text-[#525252] mt-0.5">
              Live multi-metric oscillation with high-utilization threshold (85%)
            </p>
          </div>

          {/* Metric Selector Pills */}
          <div className="flex items-center bg-[#F4F4F4] p-0.5 rounded-[3px] border border-[#E0E0E0] text-xs">
            <button
              onClick={() => setActiveMetricTab('all')}
              className={`px-3 py-1 rounded-[2px] font-medium transition-colors ${
                activeMetricTab === 'all'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              All Metrics
            </button>
            <button
              onClick={() => setActiveMetricTab('cpu')}
              className={`px-3 py-1 rounded-[2px] font-medium transition-colors ${
                activeMetricTab === 'cpu'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              CPU %
            </button>
            <button
              onClick={() => setActiveMetricTab('ram')}
              className={`px-3 py-1 rounded-[2px] font-medium transition-colors ${
                activeMetricTab === 'ram'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              RAM %
            </button>
            <button
              onClick={() => setActiveMetricTab('temp')}
              className={`px-3 py-1 rounded-[2px] font-medium transition-colors ${
                activeMetricTab === 'temp'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              Temp °C
            </button>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#6F6F6F' }}
                tickLine={false}
                axisLine={{ stroke: '#E0E0E0' }}
                interval={9}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#6F6F6F' }}
                tickLine={false}
                axisLine={{ stroke: '#E0E0E0' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E0E0E0',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: '11px',
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
              />

              {(activeMetricTab === 'all' || activeMetricTab === 'cpu') && (
                <Line
                  type="monotone"
                  dataKey="cpu_pct"
                  name="CPU Utilization (%)"
                  stroke="#0F62FE"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {(activeMetricTab === 'all' || activeMetricTab === 'ram') && (
                <Line
                  type="monotone"
                  dataKey="ram_pct"
                  name="RAM Usage (%)"
                  stroke="#8A3FFC"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {(activeMetricTab === 'all' || activeMetricTab === 'temp') && (
                <Line
                  type="monotone"
                  dataKey="temperature"
                  name="Temperature (°C)"
                  stroke="#FA4D56"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 10-Server Status Matrix Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Server Matrix & Health Profiles
            </h2>
            <span className="text-xs text-[#525252]">({servers.length} Monitored Nodes)</span>
          </div>
          <button
            onClick={() => navigate('/servers')}
            className="text-xs text-[#0F62FE] hover:underline font-medium flex items-center gap-1"
          >
            <span>Full Inventory View</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {servers.slice(0, 10).map((server) => {
            const currentMetric = metricsMap[server.hostname] || {
              cpu_pct: server.cpu_pct || 45,
              ram_pct: server.ram_pct || 60,
              temperature: server.temperature || 62,
            };

            const isAnomalous = server.status === 'anomalous' || server.status === 'critical' || currentMetric.cpu_pct > 85;

            return (
              <div
                key={server.id || server.hostname}
                onClick={() => openServerDrawer(server)}
                className={`card p-3.5 bg-white hover:border-[#0F62FE] hover:shadow-md transition-all cursor-pointer relative group ${
                  isAnomalous ? 'border-red-300 bg-red-50/20' : ''
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isAnomalous ? 'bg-[#DA1E28] animate-ping' : 'bg-[#24A148]'
                      }`}
                    />
                    <span className="text-xs font-bold text-[#161616] truncate max-w-[90px]">
                      {server.hostname}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#525252] bg-[#F4F4F4] px-1.5 py-0.5 rounded">
                    {server.rack || 'Rack-A'}
                  </span>
                </div>

                {/* Bars */}
                <div className="space-y-2 mb-3">
                  <MetricBar label="CPU" value={currentMetric.cpu_pct} height="h-1.5" />
                  <MetricBar label="RAM" value={currentMetric.ram_pct} height="h-1.5" />
                </div>

                {/* Footer specs & quick action */}
                <div className="flex items-center justify-between pt-2 border-t border-[#F4F4F4] text-[11px]">
                  <span className={`font-mono font-medium ${currentMetric.temperature > 80 ? 'text-[#DA1E28]' : 'text-[#525252]'}`}>
                    {currentMetric.temperature}°C
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/predictions?server=${server.hostname}`);
                    }}
                    className="text-[10px] text-[#0F62FE] hover:bg-[#EDF5FF] px-1.5 py-0.5 rounded font-medium transition-colors"
                  >
                    Risk Model →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Incidents Table */}
      <div className="card bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E0E0E0] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
              Recent Triaged Incidents
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Anomaly detection events triggered by isolation forest and threshold rules
            </p>
          </div>
          <button
            onClick={() => navigate('/incidents')}
            className="btn-secondary text-xs"
          >
            View All Incidents
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F4F4F4] text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
                <th className="py-2.5 px-4">Incident ID</th>
                <th className="py-2.5 px-4">Node Target</th>
                <th className="py-2.5 px-4">Anomaly Classification</th>
                <th className="py-2.5 px-4">Severity</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Triggered Time</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0] text-xs">
              {incidents.slice(0, 5).map((inc) => (
                <tr
                  key={inc.id}
                  onClick={() => navigate(`/incidents?id=${inc.id}`)}
                  className="hover:bg-[#F4F4F4] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-medium text-[#161616]">
                    {inc.id.slice(0, 10)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#0F62FE]">
                    {inc.server_id}
                  </td>
                  <td className="py-3 px-4 text-[#161616]">
                    <div className="font-medium">{inc.incident_type}</div>
                    <div className="text-[11px] text-[#525252] truncate max-w-xs">{inc.description}</div>
                  </td>
                  <td className="py-3 px-4">
                    <SeverityBadge severity={inc.severity} />
                  </td>
                  <td className="py-3 px-4">
                    <SeverityBadge severity={inc.status} />
                  </td>
                  <td className="py-3 px-4 text-[#525252] font-mono text-[11px]">
                    {new Date(inc.created_at).toLocaleTimeString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {inc.status === 'active' ? (
                      <button
                        onClick={(e) => handleAcknowledgeIncident(inc.id, e)}
                        className="btn-secondary text-xs px-2.5 py-1 text-[#0F62FE] hover:bg-[#EDF5FF]"
                      >
                        Acknowledge
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#24A148] font-medium flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Acked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Server Detail Drawer */}
      {drawerOpen && selectedServer && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl flex flex-col border-l border-[#E0E0E0] animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between bg-[#F4F4F4]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#161616]">
                    {selectedServer.name || selectedServer.hostname}
                  </h3>
                  <SeverityBadge
                    severity={selectedServer.status === 'anomalous' ? 'critical' : 'healthy'}
                  />
                </div>
                <p className="text-xs text-[#525252] font-mono mt-0.5">
                  {selectedServer.hostname} · {selectedServer.ip_address}
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 rounded hover:bg-[#E0E0E0] text-[#525252]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Telemetry Snapshot */}
              <div>
                <h4 className="text-xs font-bold text-[#525252] uppercase tracking-wider mb-3">
                  Live Resource Allocation
                </h4>
                <div className="space-y-3.5 card p-4 bg-[#F4F4F4]/50">
                  <MetricBar
                    label="CPU Load"
                    value={metricsMap[selectedServer.hostname]?.cpu_pct || 64}
                    height="h-2.5"
                  />
                  <MetricBar
                    label="Memory Utilization"
                    value={metricsMap[selectedServer.hostname]?.ram_pct || 72}
                    height="h-2.5"
                  />
                  <MetricBar
                    label="Disk Volume (NVMe)"
                    value={metricsMap[selectedServer.hostname]?.disk_pct || 58}
                    height="h-2.5"
                  />
                  <div className="pt-2 flex justify-between text-xs">
                    <span className="text-[#525252]">Chassis Temperature</span>
                    <span className="font-bold text-[#161616]">
                      {metricsMap[selectedServer.hostname]?.temperature || 68}°C
                    </span>
                  </div>
                </div>
              </div>

              {/* Hardware Specs */}
              <div>
                <h4 className="text-xs font-bold text-[#525252] uppercase tracking-wider mb-3">
                  Node Specifications
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 card bg-white">
                    <span className="text-[#525252] block text-[11px]">Processor</span>
                    <span className="font-semibold text-[#161616]">{selectedServer.cpu_cores || 64} vCPUs (EPYC)</span>
                  </div>
                  <div className="p-3 card bg-white">
                    <span className="text-[#525252] block text-[11px]">System Memory</span>
                    <span className="font-semibold text-[#161616]">{selectedServer.ram_gb || 256} GB DDR5</span>
                  </div>
                  <div className="p-3 card bg-white">
                    <span className="text-[#525252] block text-[11px]">Rack / Unit</span>
                    <span className="font-semibold text-[#161616]">{selectedServer.rack || 'Rack-A'} (U12)</span>
                  </div>
                  <div className="p-3 card bg-white">
                    <span className="text-[#525252] block text-[11px]">Data Center Zone</span>
                    <span className="font-semibold text-[#161616]">{selectedServer.datacenter || 'US-East-1'}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2 pt-4">
                <button
                  onClick={() => {
                    navigate(`/predictions?server=${selectedServer.hostname}`);
                  }}
                  className="w-full btn-primary py-2.5 text-xs flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Run Bi-LSTM Forecaster & SHAP</span>
                </button>
                <button
                  onClick={() => {
                    navigate(`/ai-explanation?server=${selectedServer.hostname}`);
                  }}
                  className="w-full btn-secondary py-2.5 text-xs flex items-center justify-center gap-2"
                >
                  <Brain className="w-4 h-4 text-[#0F62FE]" />
                  <span>Inspect Decision Tree Explanation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
