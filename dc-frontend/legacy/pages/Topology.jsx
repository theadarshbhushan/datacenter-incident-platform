import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network,
  Server,
  Layers,
  Cpu,
  Zap,
  Activity,
  X,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import SeverityBadge from '../components/SeverityBadge';
import MetricBar from '../components/MetricBar';

const RACKS = [
  {
    id: 'rack-a',
    name: 'Rack-A (Compute Pod 1)',
    zone: 'Row 1 · Cold Aisle',
    servers: [
      { id: 'server-001', u: 'U12-U14', status: 'critical', cpu: 94.2, ram: 88.5, temp: 84.1, ip: '10.0.1.11' },
      { id: 'server-002', u: 'U09-U11', status: 'healthy', cpu: 42.1, ram: 54.0, temp: 58.2, ip: '10.0.1.12' },
      { id: 'server-003', u: 'U06-U08', status: 'healthy', cpu: 38.5, ram: 48.2, temp: 56.4, ip: '10.0.1.13' },
      { id: 'server-004', u: 'U03-U05', status: 'healthy', cpu: 51.0, ram: 62.1, temp: 61.0, ip: '10.0.1.14' },
      { id: 'server-005', u: 'U01-U02', status: 'healthy', cpu: 33.2, ram: 40.8, temp: 52.8, ip: '10.0.1.15' },
    ],
  },
  {
    id: 'rack-b',
    name: 'Rack-B (Compute Pod 2)',
    zone: 'Row 1 · Cold Aisle',
    servers: [
      { id: 'server-006', u: 'U12-U14', status: 'healthy', cpu: 46.8, ram: 59.3, temp: 59.4, ip: '10.0.1.21' },
      { id: 'server-007', u: 'U09-U11', status: 'warning', cpu: 78.4, ram: 82.0, temp: 74.5, ip: '10.0.1.22' },
      { id: 'server-008', u: 'U06-U08', status: 'healthy', cpu: 44.1, ram: 52.0, temp: 58.1, ip: '10.0.1.23' },
      { id: 'server-009', u: 'U03-U05', status: 'healthy', cpu: 39.0, ram: 49.5, temp: 55.0, ip: '10.0.1.24' },
      { id: 'server-010', u: 'U01-U02', status: 'healthy', cpu: 29.5, ram: 38.0, temp: 50.2, ip: '10.0.1.25' },
    ],
  },
  {
    id: 'rack-c',
    name: 'Rack-C (Storage Array Pod)',
    zone: 'Row 2 · Warm Aisle',
    servers: [
      { id: 'server-011', u: 'U12-U14', status: 'healthy', cpu: 32.1, ram: 68.4, temp: 54.2, ip: '10.0.2.11' },
      { id: 'server-012', u: 'U09-U11', status: 'healthy', cpu: 35.0, ram: 71.2, temp: 55.6, ip: '10.0.2.12' },
      { id: 'server-013', u: 'U06-U08', status: 'healthy', cpu: 41.2, ram: 65.0, temp: 58.0, ip: '10.0.2.13' },
      { id: 'server-014', u: 'U03-U05', status: 'warning', cpu: 81.0, ram: 76.5, temp: 76.2, ip: '10.0.2.14' },
      { id: 'server-015', u: 'U01-U02', status: 'healthy', cpu: 28.0, ram: 44.0, temp: 49.8, ip: '10.0.2.15' },
    ],
  },
  {
    id: 'rack-d',
    name: 'Rack-D (Edge Ingest & Kafka)',
    zone: 'Row 2 · Warm Aisle',
    servers: [
      { id: 'server-016', u: 'U12-U14', status: 'healthy', cpu: 49.2, ram: 62.0, temp: 63.1, ip: '10.0.3.11' },
      { id: 'server-017', u: 'U09-U11', status: 'healthy', cpu: 44.0, ram: 58.4, temp: 60.5, ip: '10.0.3.12' },
      { id: 'server-018', u: 'U06-U08', status: 'healthy', cpu: 38.0, ram: 50.0, temp: 57.0, ip: '10.0.3.13' },
      { id: 'server-019', u: 'U03-U05', status: 'healthy', cpu: 52.5, ram: 64.1, temp: 62.8, ip: '10.0.3.14' },
      { id: 'server-020', u: 'U01-U02', status: 'healthy', cpu: 31.0, ram: 41.5, temp: 51.5, ip: '10.0.3.15' },
    ],
  },
];

export const Topology = () => {
  const navigate = useNavigate();
  const [selectedDC, setSelectedDC] = useState('us-east-1');
  const [selectedServer, setSelectedServer] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
            Data Center Physical & Network Topology
          </h1>
          <p className="text-xs text-[#525252] mt-0.5">
            Spine-leaf interconnect diagram, physical rack layouts, and unit-level thermal status
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#525252] font-medium">Facility:</span>
            <select
              value={selectedDC}
              onChange={(e) => setSelectedDC(e.target.value)}
              className="bg-white border border-[#E0E0E0] rounded-[3px] px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#0F62FE]"
            >
              <option value="us-east-1">US-East DC-01 (Ashburn, VA)</option>
              <option value="us-west-2">US-West DC-02 (Oregon)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#525252] font-medium">Filter:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-[#E0E0E0] rounded-[3px] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0F62FE]"
            >
              <option value="all">All Nodes</option>
              <option value="critical">Critical / Alert Only</option>
              <option value="healthy">Healthy Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Core Spine-Leaf Network Architecture Diagram Box */}
      <div className="card p-5 bg-white border border-[#E0E0E0]">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E0E0E0]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-[#0F62FE]" />
            <h2 className="text-xs font-bold text-[#161616] uppercase tracking-wider">
              Core Spine-Leaf Network Interconnect (100 Gbps Backbone)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#24A148] font-bold">● 400 Gbps DCI REDUNDANT</span>
        </div>

        {/* Diagram Flow */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 py-2">
          {/* Edge Router */}
          <div className="p-3 bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] text-center w-48 shadow-sm">
            <span className="text-[10px] text-[#525252] uppercase font-bold block">Border Gateway</span>
            <span className="font-mono text-xs font-bold text-[#161616]">bgw-core-01.dc01</span>
            <span className="text-[10px] text-[#24A148] block mt-0.5 font-mono">BGP 65001 (Active)</span>
          </div>

          <div className="hidden md:block w-8 h-0.5 bg-[#0F62FE]" />

          {/* Spine Switches */}
          <div className="flex gap-2">
            <div className="p-2.5 bg-[#EDF5FF] border border-[#D0E2FF] rounded-[3px] text-center w-36">
              <span className="text-[9px] text-[#0F62FE] font-bold block">SPINE SWITCH 1</span>
              <span className="font-mono text-xs font-semibold text-[#161616]">spine-01 (100G)</span>
            </div>
            <div className="p-2.5 bg-[#EDF5FF] border border-[#D0E2FF] rounded-[3px] text-center w-36">
              <span className="text-[9px] text-[#0F62FE] font-bold block">SPINE SWITCH 2</span>
              <span className="font-mono text-xs font-semibold text-[#161616]">spine-02 (100G)</span>
            </div>
          </div>

          <div className="hidden md:block w-8 h-0.5 bg-[#0F62FE]" />

          {/* ToR Switches */}
          <div className="p-3 bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] text-center w-48 shadow-sm">
            <span className="text-[10px] text-[#525252] uppercase font-bold block">Top-of-Rack Switches</span>
            <span className="font-mono text-xs font-bold text-[#161616]">tor-[a-d].pod01</span>
            <span className="text-[10px] text-[#0F62FE] block mt-0.5 font-mono">25G SFP28 Downlinks</span>
          </div>
        </div>
      </div>

      {/* Racks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {RACKS.map((rack) => (
          <div key={rack.id} className="card bg-white border border-[#E0E0E0] flex flex-col">
            {/* Rack Header */}
            <div className="p-3.5 bg-[#F4F4F4] border-b border-[#E0E0E0]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#161616] uppercase">{rack.name}</h3>
                <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 border border-[#E0E0E0] rounded">
                  42U Standard
                </span>
              </div>
              <p className="text-[10px] text-[#525252] mt-0.5">{rack.zone}</p>
            </div>

            {/* Servers inside Rack */}
            <div className="p-3 space-y-2 flex-1">
              {rack.servers
                .filter((s) => (statusFilter === 'all' ? true : statusFilter === 'critical' ? s.status === 'critical' : s.status === 'healthy'))
                .map((srv) => {
                  const isCrit = srv.status === 'critical';
                  const isWarn = srv.status === 'warning';

                  return (
                    <div
                      key={srv.id}
                      onClick={() => setSelectedServer({ ...srv, rack: rack.name })}
                      className={`p-2.5 rounded-[3px] border transition-all cursor-pointer ${
                        isCrit
                          ? 'bg-red-50/50 border-red-300 hover:border-[#DA1E28]'
                          : isWarn
                          ? 'bg-yellow-50/50 border-yellow-300 hover:border-[#F1C21B]'
                          : 'bg-white border-[#E0E0E0] hover:border-[#0F62FE]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isCrit ? 'bg-[#DA1E28] animate-ping' : isWarn ? 'bg-[#F1C21B]' : 'bg-[#24A148]'
                            }`}
                          />
                          <span className="font-mono font-bold text-[#161616]">{srv.id}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#525252]">{srv.u}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#525252]">
                        <span>CPU: <strong className={isCrit ? 'text-[#DA1E28]' : 'text-[#161616]'}>{srv.cpu}%</strong></span>
                        <span>Temp: <strong className={srv.temp > 80 ? 'text-[#DA1E28]' : 'text-[#161616]'}>{srv.temp}°C</strong></span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Slide-over Server Inspector Drawer */}
      {selectedServer && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setSelectedServer(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl flex flex-col border-l border-[#E0E0E0] animate-in slide-in-from-right duration-200">
            <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between bg-[#F4F4F4]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#161616]">{selectedServer.id}</h3>
                  <SeverityBadge severity={selectedServer.status} />
                </div>
                <p className="text-xs text-[#525252] font-mono mt-0.5">
                  IP: {selectedServer.ip} · Position: {selectedServer.u}
                </p>
              </div>
              <button
                onClick={() => setSelectedServer(null)}
                className="p-1 rounded hover:bg-[#E0E0E0] text-[#525252]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div>
                <h4 className="text-xs font-bold text-[#525252] uppercase tracking-wider mb-2">
                  Chassis Telemetry
                </h4>
                <div className="card p-4 bg-[#F4F4F4]/60 space-y-3">
                  <MetricBar label="CPU Load" value={selectedServer.cpu} />
                  <MetricBar label="RAM Usage" value={selectedServer.ram} />
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-[#525252]">Chassis Temperature</span>
                    <span className={`font-bold ${selectedServer.temp > 80 ? 'text-[#DA1E28]' : 'text-[#161616]'}`}>
                      {selectedServer.temp}°C
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-[#525252] uppercase tracking-wider mb-2">
                  Topology Placement
                </h4>
                <div className="card p-3.5 bg-white text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#525252]">Assigned Rack:</span>
                    <span className="font-semibold text-[#161616]">{selectedServer.rack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#525252]">Switch Port:</span>
                    <span className="font-mono text-[#0F62FE]">tor-a.port-24 (25GbE)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#525252]">PDU Power Outlet:</span>
                    <span className="font-mono text-[#161616]">PDU-A-12 (208V / 16A)</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E0E0E0] space-y-2">
                <button
                  onClick={() => {
                    navigate(`/predictions?server=${selectedServer.id}`);
                  }}
                  className="w-full btn-primary py-2.5 text-xs flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Run Bi-LSTM Risk Prediction</span>
                </button>
                <button
                  onClick={() => {
                    navigate(`/ai-explanation?server=${selectedServer.id}`);
                  }}
                  className="w-full btn-secondary py-2.5 text-xs flex items-center justify-center gap-2"
                >
                  <Cpu className="w-4 h-4 text-[#0F62FE]" />
                  <span>Inspect SHAP Attribution</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Topology;
