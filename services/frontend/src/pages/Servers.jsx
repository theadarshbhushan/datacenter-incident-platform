import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server,
  Plus,
  Search,
  Filter,
  TrendingUp,
  Brain,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { serversAPI } from '../services/api';
import SeverityBadge from '../components/SeverityBadge';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';

export const Servers = () => {
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    ip_address: '',
    cpu_cores: 32,
    ram_gb: 128,
    disk_gb: 1000,
    location: 'Rack-A',
  });

  const fetchServers = async () => {
    try {
      setLoading(true);
      const data = await serversAPI.getServers();
      setServers(data);
    } catch (err) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ['cpu_cores', 'ram_gb', 'disk_gb'].includes(name) ? parseInt(value, 10) || 0 : value,
    }));
  };

  const handleOpenAddModal = () => {
    setEditingServer(null);
    setFormData({
      name: '',
      hostname: '',
      ip_address: '10.0.1.',
      cpu_cores: 32,
      ram_gb: 128,
      disk_gb: 1000,
      location: 'Rack-A',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (server, e) => {
    e.stopPropagation();
    setEditingServer(server);
    setFormData({
      name: server.name || '',
      hostname: server.hostname || '',
      ip_address: server.ip_address || '',
      cpu_cores: server.cpu_cores || 32,
      ram_gb: server.ram_gb || 128,
      disk_gb: server.disk_gb || 1000,
      location: server.location || server.rack || 'Rack-A',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingServer) {
        await serversAPI.updateServer(editingServer.id, formData);
      } else {
        await serversAPI.createServer(formData);
      }
      setIsModalOpen(false);
      fetchServers();
    } catch (err) {
      console.error('Failed to save server:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await serversAPI.deleteServer(deleteTargetId);
      setDeleteTargetId(null);
      fetchServers();
    } catch (err) {
      console.error('Failed to delete server:', err);
    }
  };

  const filteredServers = servers.filter((srv) => {
    const matchesSearch =
      srv.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (srv.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (srv.ip_address || '').includes(searchQuery);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'critical' ? srv.status === 'anomalous' || srv.status === 'critical' : srv.status === 'healthy');

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#161616] tracking-tight flex items-center gap-2">
            Server Infrastructure Inventory
          </h1>
          <p className="text-xs text-[#525252] mt-0.5">
            Provision bare-metal compute instances, inspect telemetry allocations, and trigger risk predictions
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchServers}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#525252]" />
            <span>Sync Fleet</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Provision Node</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="card p-4 bg-white flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
          <input
            type="text"
            placeholder="Search hostname, IP, or workload tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] focus:bg-white focus:outline-none focus:border-[#0F62FE]"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#525252] font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-[#E0E0E0] rounded-[3px] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0F62FE]"
            >
              <option value="all">All Statuses ({servers.length})</option>
              <option value="healthy">Healthy Nodes</option>
              <option value="critical">Critical / Alerting</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="card bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F4F4F4] text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
                <th className="py-2.5 px-4">Hostname & Name</th>
                <th className="py-2.5 px-4">IPv4 Address</th>
                <th className="py-2.5 px-4">Rack & Pod</th>
                <th className="py-2.5 px-4">Hardware Specs</th>
                <th className="py-2.5 px-4">Health Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0]">
              {filteredServers.map((server) => {
                const isAnomalous = server.status === 'anomalous' || server.status === 'critical';

                return (
                  <tr
                    key={server.id || server.hostname}
                    className="hover:bg-[#F4F4F4] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#161616] font-mono">{server.hostname}</div>
                      <div className="text-[11px] text-[#525252]">{server.name || 'Generic Compute Node'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#525252]">
                      {server.ip_address}
                    </td>
                    <td className="py-3 px-4 text-[#161616] font-medium">
                      {server.location || server.rack || 'Rack-A'}
                    </td>
                    <td className="py-3 px-4 text-[#525252] font-mono text-[11px]">
                      {server.cpu_cores || 32} vCPU · {server.ram_gb || 128} GB RAM · {server.disk_gb || 1000} GB SSD
                    </td>
                    <td className="py-3 px-4">
                      <SeverityBadge
                        severity={isAnomalous ? 'critical' : 'healthy'}
                        label={isAnomalous ? 'ANOMALY DETECTED' : 'HEALTHY'}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/predictions?server=${server.hostname}`)}
                          className="btn-secondary text-[11px] px-2.5 py-1 text-[#0F62FE] hover:bg-[#EDF5FF] flex items-center gap-1"
                        >
                          <TrendingUp className="w-3 h-3" />
                          <span>Predict</span>
                        </button>
                        <button
                          onClick={(e) => handleOpenEditModal(server, e)}
                          className="p-1 text-[#525252] hover:text-[#0F62FE] hover:bg-[#EDF5FF] rounded"
                          title="Edit Node"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetId(server.id);
                          }}
                          className="p-1 text-[#525252] hover:text-[#DA1E28] hover:bg-[#FFF1F1] rounded"
                          title="Decommission Node"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provision / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
          <div className="bg-white rounded-[4px] border border-[#E0E0E0] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E0E0] bg-[#F4F4F4]">
              <h3 className="text-sm font-bold text-[#161616]">
                {editingServer ? `Modify Node ${editingServer.hostname}` : 'Provision Infrastructure Node'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#525252] hover:text-[#161616] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#161616] mb-1">Hostname</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingServer}
                    value={formData.hostname}
                    onChange={handleInputChange}
                    name="hostname"
                    placeholder="e.g. server-037"
                    className="w-full bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] p-2 text-xs focus:bg-white focus:outline-none focus:border-[#0F62FE] disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#161616] mb-1">Display Label</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    name="name"
                    placeholder="e.g. Ingestion Gateway Pod"
                    className="w-full bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] p-2 text-xs focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#161616] mb-1">IPv4 Address</label>
                  <input
                    type="text"
                    required
                    value={formData.ip_address}
                    onChange={handleInputChange}
                    name="ip_address"
                    placeholder="10.0.1.37"
                    className="w-full bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] p-2 text-xs focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#161616] mb-1">Rack Location</label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={handleInputChange}
                    name="location"
                    placeholder="Rack-A (U12)"
                    className="w-full bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] p-2 text-xs focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-[#161616] mb-1">vCPUs</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formData.cpu_cores}
                    onChange={handleInputChange}
                    name="cpu_cores"
                    className="w-full bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] p-2 text-xs focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#161616] mb-1">RAM (GB)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formData.ram_gb}
                    onChange={handleInputChange}
                    name="ram_gb"
                    className="w-full bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] p-2 text-xs focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#161616] mb-1">SSD Disk (GB)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formData.disk_gb}
                    onChange={handleInputChange}
                    name="disk_gb"
                    className="w-full bg-[#F4F4F4] border border-[#E0E0E0] rounded-[3px] p-2 text-xs focus:bg-white focus:outline-none focus:border-[#0F62FE]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E0E0E0]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs px-4 py-2"
                >
                  {editingServer ? 'Save Changes' : 'Confirm Provisioning'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTargetId}
        title="Decommission Server Instance"
        message="Are you sure you want to decommission this node? Telemetry logging and predictive model training on this node will cease immediately."
        confirmText="Decommission"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
};

export default Servers;
