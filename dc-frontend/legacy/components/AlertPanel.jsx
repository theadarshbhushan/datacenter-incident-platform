import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

export const AlertPanel = ({ activeIncidents = [], onAcknowledge }) => {
  const [noteInputs, setNoteInputs] = useState({});

  const handleNoteChange = (id, val) => {
    setNoteInputs((prev) => ({ ...prev, [id]: val }));
  };

  const getSeverityStyles = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-accentRose/15 border-accentRose/30 text-accentRose';
      case 'high':
        return 'bg-accentRose/10 border-accentRose/20 text-accentRose/90';
      case 'medium':
        return 'bg-accentAmber/15 border-accentAmber/30 text-accentAmber';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  return (
    <div className="glass-panel p-5 rounded-xl flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 border-b border-borderSlate pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-accentRose animate-pulse" />
          <h2 className="font-bold text-sm tracking-wider uppercase text-slate-200">
            Active Alerts
          </h2>
        </div>
        <span className="bg-accentRose/25 text-accentRose text-xs font-bold px-2 py-0.5 rounded-full glow-rose animate-alert-pulse">
          {activeIncidents.length} Unresolved
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {activeIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 font-medium text-xs gap-2">
            <CheckCircle className="w-8 h-8 text-accentEmerald" />
            <span>All systems nominal. No active alerts.</span>
          </div>
        ) : (
          activeIncidents.map((incident) => {
            const { id, server_id, incident_type, severity, detected_at, notes, acknowledged } = incident;
            const inputNote = noteInputs[id] || '';

            return (
              <div 
                key={id}
                className={`p-3.5 rounded-lg border flex flex-col gap-2 transition-all ${
                  acknowledged 
                    ? 'bg-slate-900/40 border-borderSlate' 
                    : 'bg-accentRose/5 border-accentRose/10 glow-rose/5'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">{server_id}</span>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                      {incident_type.replace('_', ' ')}
                    </span>
                  </div>
                  <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded border ${getSeverityStyles(severity)}`}>
                    {severity}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(detected_at).toLocaleString()}</span>
                </div>

                {notes && (
                  <p className="text-[10px] text-slate-400 font-medium bg-slate-900/50 p-2 rounded border border-borderSlate/30">
                    <span className="font-bold text-slate-500">Log:</span> {notes}
                  </p>
                )}

                {!acknowledged && (
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Add resolution note..."
                      value={inputNote}
                      onChange={(e) => handleNoteChange(id, e.target.value)}
                      className="flex-1 bg-slate-950/70 border border-borderSlate rounded px-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-accentCyan placeholder-slate-600 transition-all"
                    />
                    <button
                      onClick={() => {
                        onAcknowledge(id, inputNote);
                        handleNoteChange(id, '');
                      }}
                      className="bg-accentCyan/15 border border-accentCyan/30 text-accentCyan px-3 py-1 rounded text-[11px] font-bold hover:bg-accentCyan hover:text-darkBg hover:border-transparent transition-all"
                    >
                      Acknowledge
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AlertPanel;
