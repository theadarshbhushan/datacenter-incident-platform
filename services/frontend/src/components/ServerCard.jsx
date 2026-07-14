import React from 'react';
import { Cpu, Database, HardDrive, MapPin, Activity } from 'lucide-react';

export const ServerCard = ({ server, currentMetrics, isSelected, onClick, onPredict }) => {
  const { hostname, name, ip_address, status, cpu_cores, ram_gb, disk_gb, location } = server;

  const cpu = currentMetrics?.cpu_pct ?? 0;
  const ram = currentMetrics?.ram_pct ?? 0;
  const temp = currentMetrics?.temp_celsius ?? 0;

  const getStatusColor = (s) => {
    switch (s) {
      case 'active': return 'bg-accentEmerald text-accentEmerald glow-emerald';
      case 'anomalous': return 'bg-accentRose text-accentRose glow-rose animate-alert-pulse';
      case 'maintenance': return 'bg-accentAmber text-accentAmber glow-amber';
      default: return 'bg-slate-500 text-slate-500';
    }
  };

  const getProgressColor = (val) => {
    if (val > 85) return 'bg-accentRose glow-rose';
    if (val > 70) return 'bg-accentAmber glow-amber';
    return 'bg-accentCyan glow-cyan';
  };

  return (
    <div
      onClick={onClick}
      className={`glass-panel p-5 rounded-xl transition-all duration-300 cursor-pointer flex flex-col justify-between ${
        isSelected
          ? 'ring-2 ring-accentCyan border-transparent bg-panelBg/70 transform -translate-y-1'
          : 'hover:bg-panelBg/40 hover:border-slate-700 hover:transform hover:-translate-y-0.5'
      }`}
    >
      <div>
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-slate-100 text-sm tracking-wide">{name}</h3>
            <span className="text-xs text-slate-500 font-medium">{hostname}</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/50 border border-borderSlate px-2.5 py-1 rounded-full">
            <span className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              {status}
            </span>
          </div>
        </div>

        {/* System Specs */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-[10px] text-slate-400 font-medium bg-slate-900/30 p-2.5 rounded-lg border border-borderSlate/50">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            <span>{cpu_cores} Cores</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span>{ram_gb} GB RAM</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span>{disk_gb} GB SSD</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-500" />
            <span>{location}</span>
          </div>
        </div>

        {/* Telemetry Progress Bars */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1 text-slate-400">
              <span>CPU Load</span>
              <span className="text-slate-200">{cpu.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getProgressColor(cpu)}`}
                style={{ width: `${Math.min(100, cpu)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold mb-1 text-slate-400">
              <span>RAM Load</span>
              <span className="text-slate-200">{ram.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getProgressColor(ram)}`}
                style={{ width: `${Math.min(100, ram)}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 pt-1">
            <span>Core Temp</span>
            <span className={`text-slate-200 ${temp > 80 ? 'text-accentRose font-bold animate-pulse' : ''}`}>
              {temp.toFixed(1)}°C
            </span>
          </div>
        </div>
      </div>

      {onPredict && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPredict(hostname);
          }}
          className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold bg-accentCyan/10 text-accentCyan hover:bg-accentCyan hover:text-darkBg border border-accentCyan/30 hover:border-transparent transition-all"
        >
          <Activity className="w-3.5 h-3.5" />
          Predict Anomaly
        </button>
      )}
    </div>
  );
};

export default ServerCard;
