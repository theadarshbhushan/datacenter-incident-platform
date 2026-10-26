import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertOctagon,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  X,
  RefreshCw,
  Sliders,
  ChevronRight,
  ShieldAlert,
  Brain,
  Check,
} from 'lucide-react';
import { incidentsAPI } from '../services/api';
import SeverityBadge from '../components/SeverityBadge';
import MetricBar from '../components/MetricBar';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';

export const Incidents = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialId = searchParams.get('id');

  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, acknowledged, resolved
  const [severityFilter, setSeverityFilter] = useState('all'); // all, critical, high, medium, low

  // Resolve modal
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const data = await incidentsAPI.getIncidents();
      setIncidents(data);

      if (initialId) {
        const found = data.find((i) => i.id === initialId);
        if (found) {
          setSelectedIncident(found);
          setDrawerOpen(true);
        }
      }
    } catch (err) {
      console.error('Failed to load incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleRowClick = (incident) => {
    setSelectedIncident(incident);
    setDrawerOpen(true);
  };

  const handleAcknowledge = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await incidentsAPI.acknowledgeIncident(id, 'Acknowledged by operator in Incident Center');
      setIncidents((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'acknowledged' } : item))
      );
      if (selectedIncident?.id === id) {
        setSelectedIncident((prev) => ({ ...prev, status: 'acknowledged' }));
      }
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  const handleOpenResolveModal = () => {
    setResolveNotes('Remediation verified: workload balanced and temperature stabilized.');
    setIsResolveModalOpen(true);
  };

  const handleConfirmResolve = async () => {
    if (!selectedIncident) return;
    try {
      await incidentsAPI.resolveIncident(selectedIncident.id, resolveNotes);
      setIncidents((prev) =>
        prev.map((item) =>
          item.id === selectedIncident.id
            ? { ...item, status: 'resolved', resolved_at: new Date().toISOString() }
            : item
        )
      );
      setSelectedIncident((prev) => ({
        ...prev,
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      }));
      setIsResolveModalOpen(false);
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  // Filter logic
  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch =
      inc.server_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.incident_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      inc.status.toLowerCase() === statusFilter.toLowerCase();

    const matchesSeverity =
      severityFilter === 'all' ||
      inc.severity.toLowerCase() === severityFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesSeverity;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
            Enterprise Incident Center
          </h1>
          <p className="text-xs text-[#525252] mt-0.5">
            Real-time triaging, SHAP anomaly attribution, and SLA-tracked resolution workflow
          </p>
        </div>

        <button
          onClick={fetchIncidents}
          className="btn-secondary text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#525252]" />
          <span>Refresh Incidents</span>
        </button>
      </div>

      {/* Filter Row */}
      <div className="card p-4 bg-white flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
          <input
            type="text"
            placeholder="Filter by server or incident type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] focus:bg-white focus:outline-none focus:border-[#0F62FE]"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#525252] font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-[#E0E0E0] rounded-[3px] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0F62FE]"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#525252] font-medium">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-white border border-[#E0E0E0] rounded-[3px] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0F62FE]"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="card bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F4F4F4] text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
                <th className="py-2.5 px-4">Incident ID</th>
                <th className="py-2.5 px-4">Target Node</th>
                <th className="py-2.5 px-4">Classification</th>
                <th className="py-2.5 px-4">Severity</th>
                <th className="py-2.5 px-4">Anomaly Score</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Detected</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0] text-xs">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-[#525252]">
                    No incidents match the active filters.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((inc) => (
                  <tr
                    key={inc.id}
                    onClick={() => handleRowClick(inc)}
                    className="hover:bg-[#F4F4F4] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-[#161616]">
                      {inc.id.slice(0, 12)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#0F62FE]">
                      {inc.server_id}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#161616]">
                      <div>{inc.incident_type}</div>
                      <div className="text-[11px] text-[#525252] truncate max-w-xs">{inc.description}</div>
                    </td>
                    <td className="py-3 px-4">
                      <SeverityBadge severity={inc.severity} />
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#161616]">
                      {((inc.anomaly_score || 0.85) * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 px-4">
                      <SeverityBadge severity={inc.status} />
                    </td>
                    <td className="py-3 px-4 font-mono text-[#525252] text-[11px]">
                      {new Date(inc.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {inc.status === 'active' ? (
                        <button
                          onClick={(e) => handleAcknowledge(inc.id, e)}
                          className="btn-secondary text-xs px-2.5 py-1 text-[#0F62FE] hover:bg-[#EDF5FF]"
                        >
                          Acknowledge
                        </button>
                      ) : inc.status === 'acknowledged' ? (
                        <span className="text-[11px] font-semibold text-[#8A3FFC]">
                          Acknowledged
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#24A148] flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-in Detail Drawer */}
      {drawerOpen && selectedIncident && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-lg w-full bg-white shadow-2xl flex flex-col border-l border-[#E0E0E0] animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between bg-[#F4F4F4]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#161616]">
                    Incident: {selectedIncident.id.slice(0, 14)}
                  </h3>
                  <SeverityBadge severity={selectedIncident.severity} />
                </div>
                <p className="text-xs text-[#525252] mt-0.5">
                  Target: <span className="font-mono font-bold text-[#0F62FE]">{selectedIncident.server_id}</span>
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 rounded hover:bg-[#E0E0E0] text-[#525252]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Status Banner */}
              <div className="p-4 rounded-[4px] bg-[#F4F4F4] border border-[#E0E0E0] flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-[#525252] block uppercase font-medium">Lifecycle Status</span>
                  <div className="mt-1">
                    <SeverityBadge severity={selectedIncident.status} size="md" />
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-[#525252] block uppercase font-medium">Outage Anomaly Score</span>
                  <span className="text-lg font-bold font-mono text-[#DA1E28]">
                    {((selectedIncident.anomaly_score || 0.88) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-[#525252] uppercase tracking-wider mb-1.5">
                  Description & Context
                </h4>
                <p className="text-xs text-[#161616] bg-white border border-[#E0E0E0] p-3 rounded-[3px] leading-relaxed">
                  {selectedIncident.description || 'Threshold breach or multivariate anomaly triggered by telemetry ingestion stream.'}
                </p>
              </div>

              {/* SHAP Feature Contribution Mini-Bars */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-[#525252] uppercase tracking-wider">
                    SHAP Root Cause Attribution
                  </h4>
                  <button
                    onClick={() => navigate(`/ai-explanation?server=${selectedIncident.server_id}`)}
                    className="text-[11px] text-[#0F62FE] hover:underline font-semibold flex items-center gap-1"
                  >
                    <span>Full Explanation →</span>
                  </button>
                </div>

                <div className="card p-3.5 bg-white space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-[#161616]">CPU Utilization (94.2%)</span>
                      <span className="font-mono text-[#DA1E28] font-bold">+0.45 SHAP</span>
                    </div>
                    <div className="w-full bg-[#E0E0E0] h-2 rounded-[2px] overflow-hidden">
                      <div className="h-full bg-[#DA1E28] w-[88%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-[#161616]">Chassis Temp (84.1°C)</span>
                      <span className="font-mono text-[#DA1E28] font-bold">+0.32 SHAP</span>
                    </div>
                    <div className="w-full bg-[#E0E0E0] h-2 rounded-[2px] overflow-hidden">
                      <div className="h-full bg-[#DA1E28] w-[65%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-[#161616]">Fan Controller (4,900 RPM)</span>
                      <span className="font-mono text-[#0F62FE] font-bold">-0.15 SHAP</span>
                    </div>
                    <div className="w-full bg-[#E0E0E0] h-2 rounded-[2px] overflow-hidden">
                      <div className="h-full bg-[#0F62FE] w-[35%]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-4 border-t border-[#E0E0E0]">
                {selectedIncident.status === 'active' && (
                  <button
                    onClick={(e) => handleAcknowledge(selectedIncident.id, e)}
                    className="w-full btn-secondary py-2.5 text-xs font-semibold text-[#0F62FE]"
                  >
                    Acknowledge Incident
                  </button>
                )}

                {selectedIncident.status !== 'resolved' && (
                  <button
                    onClick={handleOpenResolveModal}
                    className="w-full btn-primary py-2.5 text-xs font-semibold bg-[#24A148] hover:bg-[#1E8A3D]"
                  >
                    Mark Incident as Resolved
                  </button>
                )}

                <button
                  onClick={() => navigate(`/predictions?server=${selectedIncident.server_id}`)}
                  className="w-full btn-secondary py-2 text-xs flex items-center justify-center gap-1.5"
                >
                  <Brain className="w-3.5 h-3.5 text-[#0F62FE]" />
                  <span>Inspect Server Bi-LSTM Horizon</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Resolve Modal */}
      <ConfirmModal
        isOpen={isResolveModalOpen}
        title="Resolve Active Incident"
        message={`Are you sure you want to mark incident ${selectedIncident?.id.slice(0, 10)} on ${selectedIncident?.server_id} as resolved? This will reset the node health status to Nominal.`}
        confirmText="Confirm Resolution"
        onConfirm={handleConfirmResolve}
        onCancel={() => setIsResolveModalOpen(false)}
      />
    </div>
  );
};

export default Incidents;
