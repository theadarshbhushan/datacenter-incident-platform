import React, { useEffect, useState } from 'react';
import { serversAPI } from '../services/api';
import { Plus, Edit2, Trash2, X, Cpu, Database, HardDrive, MapPin, CheckCircle } from 'lucide-react';

export const Servers = () => {
  const [servers, setServers] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    ip_address: '',
    cpu_cores: 8,
    ram_gb: 32,
    disk_gb: 500,
    location: '',
  });

  const fetchServers = async () => {
    try {
      const data = await serversAPI.getServers();
      setServers(data);
    } catch (err) {
      console.error('Failed to load server records:', err);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ['cpu_cores', 'ram_gb', 'disk_gb'].includes(name) ? parseInt(value) || 0 : value,
    }));
  };

  const handleEditClick = (server) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      hostname: server.hostname,
      ip_address: server.ip_address,
      cpu_cores: server.cpu_cores,
      ram_gb: server.ram_gb,
      disk_gb: server.disk_gb,
      location: server.location,
    });
    setIsFormOpen(true);
  };

  const handleAddClick = () => {
    setEditingServer(null);
    setFormData({
      name: '',
      hostname: '',
      ip_address: '',
      cpu_cores: 8,
      ram_gb: 32,
      disk_gb: 500,
      location: '',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingServer) {
        await serversAPI.updateServer(editingServer.id, formData);
      } else {
        await serversAPI.createServer(formData);
      }
      setIsFormOpen(false);
      fetchServers();
    } catch (err) {
      console.error('Failed to save server:', err);
      alert(err.response?.data?.detail || 'Failed to save server settings.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this server instance? This will remove all associated metric logs.')) return;
    try {
      await serversAPI.deleteServer(id);
      fetchServers();
    } catch (err) {
      console.error('Failed to delete server record:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-borderSlate pb-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-wider text-slate-100 uppercase">
            Server Infrastructure
          </h2>
          <span className="text-xs text-slate-500 font-medium">Provision and manage datacenter nodes</span>
        </div>
        <button
          onClick={handleAddClick}
          className="flex items-center gap-1.5 bg-accentCyan hover:bg-accentCyan/90 text-darkBg py-2 px-4 rounded-lg text-xs font-bold transition-all shadow-lg glow-cyan"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        
        {/* List */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Inventory Ledger
            </h3>
            <span className="text-xs text-slate-500 font-semibold">{servers.length} Nodes Registered</span>
          </div>

          <div className="space-y-3">
            {servers.length === 0 ? (
              <div className="glass-panel p-8 text-center text-slate-500 text-xs font-semibold rounded-xl">
                No servers registered yet. Click 'Add Server' to provision the first one.
              </div>
            ) : (
              servers.map((server) => (
                <div 
                  key={server.id} 
                  className="glass-panel p-4 rounded-xl border border-borderSlate hover:border-slate-700 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-200">{server.name}</h4>
                      <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400 font-bold border border-borderSlate">
                        {server.hostname}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>IP: {server.ip_address}</span>
                      <span>&bull;</span>
                      <span className="capitalize">Status: <span className="font-bold text-accentEmerald">{server.status}</span></span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-slate-600" />
                      <span>{server.cpu_cores} VCPUs</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="w-3.5 h-3.5 text-slate-600" />
                      <span>{server.ram_gb} GB RAM</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                      <span>{server.disk_gb} GB SSD</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-600" />
                      <span>{server.location}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditClick(server)}
                      className="p-2 rounded bg-slate-900/60 border border-borderSlate hover:border-accentCyan/50 text-slate-400 hover:text-accentCyan transition-all"
                      title="Edit Properties"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="p-2 rounded bg-slate-900/60 border border-borderSlate hover:border-accentRose/50 text-slate-400 hover:text-accentRose transition-all"
                      title="Delete Node"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Provision Form */}
        {isFormOpen && (
          <div className="glass-panel p-5 rounded-xl border border-accentCyan/20 glow-cyan/5">
            <div className="flex justify-between items-center mb-4 border-b border-borderSlate pb-3">
              <h3 className="font-bold text-sm tracking-wider uppercase text-slate-200">
                {editingServer ? 'Modify Server' : 'Provision Server'}
              </h3>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-slate-500 hover:text-slate-200 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold text-slate-400">
              <div className="space-y-1">
                <label className="block">Display Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Database Server 1"
                  className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block">Hostname</label>
                  <input
                    type="text"
                    name="hostname"
                    required
                    disabled={!!editingServer}
                    value={formData.hostname}
                    onChange={handleInputChange}
                    placeholder="e.g. db-srv-01"
                    className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block">IP Address</label>
                  <input
                    type="text"
                    name="ip_address"
                    required
                    value={formData.ip_address}
                    onChange={handleInputChange}
                    placeholder="e.g. 10.0.1.15"
                    className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="block">VCPUs</label>
                  <input
                    type="number"
                    name="cpu_cores"
                    required
                    min={1}
                    value={formData.cpu_cores}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block">RAM (GB)</label>
                  <input
                    type="number"
                    name="ram_gb"
                    required
                    min={1}
                    value={formData.ram_gb}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block">Disk (GB)</label>
                  <input
                    type="number"
                    name="disk_gb"
                    required
                    min={1}
                    value={formData.disk_gb}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block">Data Center Location</label>
                <input
                  type="text"
                  name="location"
                  required
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="e.g. Rack-B04"
                  className="w-full bg-slate-950/70 border border-borderSlate rounded p-2.5 text-slate-200 focus:outline-none focus:border-accentCyan"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1 bg-accentCyan hover:bg-accentCyan/90 text-darkBg py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg glow-cyan"
              >
                <CheckCircle className="w-4 h-4" />
                {editingServer ? 'Save Changes' : 'Provision Node'}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};

export default Servers;
