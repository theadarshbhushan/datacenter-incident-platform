import React, { useEffect, useState } from 'react';
import { incidentsAPI } from '../services/api';
import { AlertCircle, Clock, CheckCircle2, RefreshCw } from 'lucide-react';

export const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [filters, setFilters] = useState({
    server_id: '',
    severity: '',
    acknowledged: '',
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchIncidents = async () => {
    setIsRefreshing(true);
    try {
      const payload = {};
      if (filters.server_id) payload.server_id = filters.server_id;
      if (filters.severity) payload.severity = filters.severity;
      if (filters.acknowledged !== '') {
        payload.acknowledged = filters.acknowledged === 'true';
      }
      
      const data = await incidentsAPI.getIncidents(payload);
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load incident records:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const getSeverityBadge = (sev) => {
    const colors = {
      critical: 'bg-accentRose/15 border-accentRose/30 text-accentRose',
      high: 'bg-accentRose/10 border-accentRose/20 text-accentRose/90',
      medium: 'bg-accentAmber/15 border-accentAmber/30 text-accentAmber',
      low: 'bg-slate-800 border-slate-700 text-slate-400',
    };
    return (
      <span className={`text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded border ${colors[sev] || colors.low}`}>
        {sev}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-borderSlate pb-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-wider text-slate-100 uppercase">
            Incidents Ledger
          </h2>
          <span className="text-xs text-slate-500 font-medium">Audit trail of anomaly detection events</span>
        </div>
        <button
          onClick={fetchIncidents}
          className="flex items-center gap-1.5 bg-slate-900 border border-borderSlate text-slate-300 hover:text-accentCyan hover:border-accentCyan/30 py-2 px-4 rounded-lg text-xs font-bold transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Ledger
        </button>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold text-slate-400">
        <div className="space-y-1">
          <label>Filter Hostname</label>
          <input
            type="text"
            name="server_id"
            value={filters.server_id}
            onChange={handleFilterChange}
            placeholder="e.g. server-01"
            className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan placeholder-slate-600"
          />
        </div>

        <div className="space-y-1">
          <label>Filter Severity</label>
          <select
            name="severity"
            value={filters.severity}
            onChange={handleFilterChange}
            className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
          >
            <option value="">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div className="space-y-1">
          <label>Filter Acknowledged Status</label>
          <select
            name="acknowledged"
            value={filters.acknowledged}
            onChange={handleFilterChange}
            className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
          >
            <option value="">All Statuses</option>
            <option value="true">Acknowledged</option>
            <option value="false">Unacknowledged</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/60 border-b border-borderSlate text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                <th className="p-4">Server</th>
                <th className="p-4">Incident Type</th>
                <th className="p-4">Severity</th>
                <th className="p-4">Anomaly Score</th>
                <th className="p-4">Detected At</th>
                <th className="p-4">Resolved At</th>
                <th className="p-4">Audit Note</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-500 font-semibold">
                    No matching incidents found in ledger logs.
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className="border-b border-borderSlate hover:bg-slate-900/20 transition-all">
                    <td className="p-4 font-bold text-slate-200">{inc.server_id}</td>
                    <td className="p-4 capitalize font-semibold text-slate-300">
                      {inc.incident_type.replace('_', ' ')}
                    </td>
                    <td className="p-4">{getSeverityBadge(inc.severity)}</td>
                    <td className="p-4 font-semibold text-slate-300">
                      {(inc.anomaly_score * 100).toFixed(0)}%
                    </td>
                    <td className="p-4 text-slate-400 font-medium">
                      {new Date(inc.detected_at).toLocaleString()}
                    </td>
                    <td className="p-4">
                      {inc.resolved_at ? (
                        <span className="text-accentEmerald font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-accentEmerald" />
                          Resolved
                        </span>
                      ) : (
                        <span className="text-accentRose font-bold flex items-center gap-1 animate-pulse">
                          <AlertCircle className="w-3.5 h-3.5 text-accentRose" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500 font-medium max-w-[200px] truncate" title={inc.notes}>
                      {inc.notes || 'No notes logged.'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Incidents;
