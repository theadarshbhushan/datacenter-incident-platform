import React, { useEffect, useState, useCallback } from 'react';
import { serversAPI, metricsAPI, incidentsAPI, predictionsAPI } from '../services/api';
import useWebSocket from '../hooks/useWebSocket';
import ServerCard from '../components/ServerCard';
import MetricChart from '../components/MetricChart';
import AlertPanel from '../components/AlertPanel';
import IncidentTimeline from '../components/IncidentTimeline';
import { Activity, Wifi, WifiOff } from 'lucide-react';

export const Dashboard = () => {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [metricsMap, setMetricsMap] = useState({});
  const [chartMetrics, setChartMetrics] = useState([]);
  const [forecastMetrics, setForecastMetrics] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [isPredicting, setIsPredicting] = useState(false);

  // Initial Seed Load
  useEffect(() => {
    const fetchData = async () => {
      try {
        const serversData = await serversAPI.getServers();
        setServers(serversData);
        if (serversData.length > 0) {
          setSelectedServer(serversData[0]);
        }

        const incidentsData = await incidentsAPI.getIncidents();
        setIncidents(incidentsData);
        setActiveAlerts(incidentsData.filter((inc) => !inc.resolved_at));
      } catch (err) {
        console.error('Failed to load dashboard statistics:', err);
      }
    };
    fetchData();
  }, []);

  // Sync metrics ledger when selected node switches
  useEffect(() => {
    if (!selectedServer) return;

    const fetchHistory = async () => {
      try {
        const history = await metricsAPI.getMetrics(selectedServer.hostname, 50);
        setChartMetrics(history);
        setForecastMetrics([]);
      } catch (err) {
        console.error(`Failed to load history for ${selectedServer.hostname}:`, err);
      }
    };
    fetchHistory();
  }, [selectedServer]);

  // Feed incoming WebSocket logs into the layout
  const handleWebSocketMessage = useCallback(
    (msg) => {
      if (msg.type === 'metric') {
        const metric = msg.data;
        const sId = metric.server_id;

        // Card update
        setMetricsMap((prev) => ({ ...prev, [sId]: metric }));

        // Graph update
        if (selectedServer && selectedServer.hostname === sId) {
          setChartMetrics((prev) => {
            const next = [...prev, metric];
            if (next.length > 50) next.shift();
            return next;
          });
        }
      } else if (msg.type === 'incident') {
        const { action, data: incident } = msg;
        
        if (action === 'create') {
          setIncidents((prev) => [incident, ...prev]);
          setActiveAlerts((prev) => [incident, ...prev]);
          
          setServers((prev) => 
            prev.map((s) => 
              s.hostname === incident.server_id 
                ? { ...s, status: 'anomalous' } 
                : s
            )
          );
        } else if (action === 'update') {
          setIncidents((prev) =>
            prev.map((inc) => (inc.id === incident.id ? incident : inc))
          );
          setActiveAlerts((prev) => {
            const list = prev.map((inc) => (inc.id === incident.id ? incident : inc));
            return list.filter((inc) => !inc.resolved_at);
          });
          
          if (incident.resolved_at) {
            setServers((prev) =>
              prev.map((s) => {
                if (s.hostname === incident.server_id) {
                  return { ...s, status: 'active' };
                }
                return s;
              })
            );
          }
        }
      }
    },
    [selectedServer]
  );

  const { isConnected } = useWebSocket(handleWebSocketMessage);

  const handleAcknowledge = async (id, notes) => {
    try {
      await incidentsAPI.acknowledgeIncident(id, notes);
    } catch (err) {
      console.error('Failed to acknowledge incident:', err);
    }
  };

  const handleResolve = async (id, notes) => {
    try {
      await incidentsAPI.resolveIncident(id, notes);
    } catch (err) {
      console.error('Failed to resolve incident:', err);
    }
  };

  const handlePredict = async (hostname) => {
    setIsPredicting(true);
    try {
      const res = await predictionsAPI.runPrediction(hostname);
      
      if (res.forecast && res.forecast.forecast) {
        setForecastMetrics(res.forecast.forecast);
      }
      
      if (res.anomaly?.is_anomaly) {
        alert(`🚨 Outage Risk Detected! Anomaly Score: ${(res.anomaly.anomaly_score * 100).toFixed(0)}%`);
      } else {
        alert(`✅ System Nominal. No anomaly detected.`);
      }
    } catch (err) {
      console.error('Prediction analysis failed:', err);
      alert('Failed to connect to machine learning forecast models.');
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-borderSlate pb-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-wider text-slate-100 flex items-center gap-2">
            <Activity className="text-accentCyan w-5 h-5 animate-pulse" />
            NOC DASHBOARD
          </h2>
          <span className="text-xs text-slate-500 font-medium">Real-time Telemetry & Predictions</span>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/60 border border-borderSlate px-4 py-1.5 rounded-full">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-accentEmerald animate-pulse" />
              <span className="text-xs font-bold text-accentEmerald">CONNECTED</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-accentRose animate-pulse" />
              <span className="text-xs font-bold text-accentRose">DISCONNECTED</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Servers inventory */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Server Inventory
            </h3>
            <span className="text-xs text-slate-500 font-medium">{servers.length} Active Nodes</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                currentMetrics={metricsMap[server.hostname]}
                isSelected={selectedServer?.id === server.id}
                onClick={() => setSelectedServer(server)}
                onPredict={handlePredict}
              />
            ))}
          </div>

          {/* Graph Profiles */}
          {selectedServer && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Live Diagnostics: {selectedServer.name}
                  </h3>
                  <span className="text-xs text-slate-500 font-semibold">{selectedServer.hostname} ({selectedServer.ip_address})</span>
                </div>
                {isPredicting && (
                  <span className="text-xs text-accentCyan bg-accentCyan/15 border border-accentCyan/30 px-3 py-1 rounded animate-pulse font-bold">
                    Running prediction...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricChart data={chartMetrics} forecastData={forecastMetrics} type="multi" />
                <MetricChart data={chartMetrics} type="temp" />
              </div>
            </div>
          )}
        </div>

        {/* Side Panels */}
        <div className="space-y-6 h-full flex flex-col">
          <div className="h-[350px]">
            <AlertPanel activeIncidents={activeAlerts} onAcknowledge={handleAcknowledge} />
          </div>
          <div className="flex-1 min-h-[350px]">
            <IncidentTimeline incidents={incidents} onResolve={handleResolve} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
