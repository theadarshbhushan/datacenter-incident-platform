import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  ExternalLink,
  Shield,
  Send,
  Sliders,
  Check,
  Radio,
} from 'lucide-react';
import SeverityBadge from '../components/SeverityBadge';

const INITIAL_ALERTS = [
  {
    id: 'ALT-1082',
    server_id: 'server-001',
    severity: 'critical',
    title: 'Predicted CPU Spike Outage Risk',
    reason: 'Bi-LSTM model predicts 87.4% outage probability within 18 minutes. SHAP highlights CPU (94.2%) and core temperature (84.1°C).',
    timestamp: '2 minutes ago',
    acknowledged: false,
    channel: 'PagerDuty (High Priority)',
  },
  {
    id: 'ALT-1081',
    server_id: 'server-014',
    severity: 'high',
    title: 'Thermal Threshold Warning (81.0°C)',
    reason: 'Rack-C ambient temperature elevated. Auxiliary cooling fans running at 92% capacity.',
    timestamp: '14 minutes ago',
    acknowledged: false,
    channel: 'Slack #sre-ops-alerts',
  },
  {
    id: 'ALT-1080',
    server_id: 'server-007',
    severity: 'medium',
    title: 'Memory Saturation Approaching 82%',
    reason: 'Transient memory heap growth detected on container worker pool.',
    timestamp: '42 minutes ago',
    acknowledged: true,
    channel: 'Slack #sre-ops-alerts',
  },
  {
    id: 'ALT-1079',
    server_id: 'server-022',
    severity: 'low',
    title: 'Telemetry Synchronization Jitter',
    reason: 'Kafka telemetry packet latency exceeded 120ms for 3 consecutive intervals.',
    timestamp: '1 hour ago',
    acknowledged: true,
    channel: 'Email Digest',
  },
];

const ESCALATION_POLICIES = [
  { channel: 'PagerDuty P1 Escalation', target: 'Lead SRE On-Call Rotation', trigger: 'Critical severity (> 80% risk)', latency: 'Instant (0m)', status: 'active' },
  { channel: 'Slack #sre-ops-alerts', target: 'Operations Webhook Bot', trigger: 'High & Critical severities', latency: '< 5 seconds', status: 'active' },
  { channel: 'Email Notification Group', target: 'infra-alerts@datacenter.local', trigger: 'All warnings & anomalies', latency: '1 minute digest', status: 'active' },
  { channel: 'Automated Remediation Webhook', target: 'http://remediation-engine:8000', trigger: 'Predictive CPU spike (auto-scale)', latency: '30 seconds', status: 'active' },
];

export const AlertCenter = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [activeTab, setActiveTab] = useState('all'); // all, critical, warning, info

  const handleAcknowledge = (id) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  };

  const filteredAlerts = alerts.filter((alt) => {
    if (activeTab === 'critical') return alt.severity === 'critical';
    if (activeTab === 'warning') return alt.severity === 'high' || alt.severity === 'medium';
    if (activeTab === 'info') return alt.severity === 'low';
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
            Operations Alert Center
          </h1>
          <p className="text-xs text-[#525252] mt-0.5">
            Real-time automated incident dispatch, SHAP rationale summaries, and escalation routes
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Filter */}
          <div className="flex items-center bg-[#F4F4F4] p-0.5 rounded-[3px] border border-[#E0E0E0] text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-[2px] font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-white text-[#0F62FE] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => setActiveTab('critical')}
              className={`px-3 py-1.5 rounded-[2px] font-medium transition-colors ${
                activeTab === 'critical'
                  ? 'bg-white text-[#DA1E28] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              Critical ({alerts.filter((a) => a.severity === 'critical').length})
            </button>
            <button
              onClick={() => setActiveTab('warning')}
              className={`px-3 py-1.5 rounded-[2px] font-medium transition-colors ${
                activeTab === 'warning'
                  ? 'bg-white text-[#F1C21B] shadow-sm font-semibold'
                  : 'text-[#525252] hover:text-[#161616]'
              }`}
            >
              Warnings ({alerts.filter((a) => a.severity === 'high' || a.severity === 'medium').length})
            </button>
          </div>
        </div>
      </div>

      {/* Alert Feed Cards */}
      <div className="space-y-3">
        {filteredAlerts.map((alt) => (
          <div
            key={alt.id}
            className={`card p-5 bg-white border-l-4 transition-all ${
              alt.severity === 'critical'
                ? 'border-l-[#DA1E28]'
                : alt.severity === 'high'
                ? 'border-l-[#FF832B]'
                : 'border-l-[#0F62FE]'
            } ${alt.acknowledged ? 'opacity-80' : ''}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2.5">
                <SeverityBadge severity={alt.severity} />
                <span className="font-mono text-xs font-bold text-[#161616]">{alt.id}</span>
                <span className="text-xs text-[#525252]">·</span>
                <span className="font-mono font-semibold text-xs text-[#0F62FE]">
                  Target: {alt.server_id}
                </span>
              </div>
              <span className="text-xs text-[#525252] font-mono">{alt.timestamp}</span>
            </div>

            <h3 className="text-sm font-bold text-[#161616] mt-1">{alt.title}</h3>
            <p className="text-xs text-[#525252] mt-1 leading-relaxed">{alt.reason}</p>

            <div className="mt-4 pt-3 border-t border-[#F4F4F4] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="text-[#525252] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#0F62FE]" />
                <span>Dispatched to: <strong>{alt.channel}</strong></span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/predictions?server=${alt.server_id}`)}
                  className="btn-secondary text-xs px-2.5 py-1 text-[#0F62FE] hover:bg-[#EDF5FF]"
                >
                  Inspect Risk Model
                </button>

                {!alt.acknowledged ? (
                  <button
                    onClick={() => handleAcknowledge(alt.id)}
                    className="btn-primary text-xs px-3 py-1"
                  >
                    Acknowledge
                  </button>
                ) : (
                  <span className="text-xs text-[#24A148] font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Acknowledged
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Escalation Policy Status */}
      <div className="card bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E0E0E0]">
          <h2 className="text-sm font-bold text-[#161616] uppercase tracking-wider">
            Active Escalation Policies & Routing Matrix
          </h2>
          <p className="text-xs text-[#525252] mt-0.5">
            Automated notification dispatch routing configurations
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F4F4F4] text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
                <th className="py-2.5 px-4">Channel Name</th>
                <th className="py-2.5 px-4">Target Recipient</th>
                <th className="py-2.5 px-4">Trigger Condition</th>
                <th className="py-2.5 px-4">Dispatch Latency</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0]">
              {ESCALATION_POLICIES.map((pol, idx) => (
                <tr key={idx} className="hover:bg-[#F4F4F4] transition-colors">
                  <td className="py-3 px-4 font-bold text-[#161616]">{pol.channel}</td>
                  <td className="py-3 px-4 text-[#525252] font-mono">{pol.target}</td>
                  <td className="py-3 px-4 text-[#161616]">{pol.trigger}</td>
                  <td className="py-3 px-4 text-[#525252]">{pol.latency}</td>
                  <td className="py-3 px-4 text-right">
                    <SeverityBadge severity="healthy" label="ACTIVE" />
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

export default AlertCenter;
