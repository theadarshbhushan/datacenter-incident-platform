import React, { useState } from 'react';
import { AlertTriangle, Check, Info, FileText } from 'lucide-react';

export const IncidentTimeline = ({ incidents = [], onResolve }) => {
  const [resolveNotes, setResolveNotes] = useState({});

  const handleNoteChange = (id, val) => {
    setResolveNotes((prev) => ({ ...prev, [id]: val }));
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-accentRose border-accentRose/30';
      case 'high': return 'text-accentRose/80 border-accentRose/20';
      case 'medium': return 'text-accentAmber border-accentAmber/30';
      default: return 'text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="glass-panel p-5 rounded-xl flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 border-b border-borderSlate pb-3">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-accentCyan" />
          <h2 className="font-bold text-sm tracking-wider uppercase text-slate-200">
            Incident Ledger & Timeline
          </h2>
        </div>
        <span className="text-[10px] text-slate-500 font-bold uppercase">
          Chronological Order
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4 relative pl-4 border-l border-borderSlate">
        {incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 font-medium text-xs gap-2 pl-0 -ml-4">
            <FileText className="w-8 h-8 text-slate-600" />
            <span>No historical incidents recorded.</span>
          </div>
        ) : (
          incidents.map((incident) => {
            const { id, server_id, incident_type, severity, detected_at, resolved_at, notes } = incident;
            const inputNote = resolveNotes[id] || '';
            const isResolved = !!resolved_at;

            return (
              <div key={id} className="relative mb-6 last:mb-0">
                <div className={`absolute -left-[25px] top-1.5 w-4 h-4 rounded-full flex items-center justify-center border z-10 ${
                  isResolved 
                    ? 'bg-accentEmerald border-accentEmerald/50 text-darkBg' 
                    : 'bg-darkBg border-accentRose text-accentRose animate-alert-pulse'
                }`}>
                  {isResolved ? (
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-accentRose" />
                  )}
                </div>

                <div className="glass-panel p-3.5 rounded-lg border border-borderSlate/60 hover:border-slate-700/60 transition-all flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{server_id}</h4>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {incident_type.replace('_', ' ')}
                      </span>
                    </div>
                    <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${getSeverityColor(severity)}`}>
                      {severity}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-500 font-medium space-y-0.5">
                    <div>
                      <span className="text-slate-600 font-bold">Detected:</span>{' '}
                      {new Date(detected_at).toLocaleString()}
                    </div>
                    <div>
                      <span className="text-slate-600 font-bold">Status:</span>{' '}
                      {isResolved ? (
                        <span className="text-accentEmerald font-semibold">
                          Resolved at {new Date(resolved_at).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-accentRose font-semibold animate-pulse">Active / Unresolved</span>
                      )}
                    </div>
                  </div>

                  {notes && (
                    <p className="text-[10px] text-slate-400 font-medium bg-slate-900/50 p-2 rounded border border-borderSlate/30">
                      <span className="font-bold text-slate-500">Log:</span> {notes}
                    </p>
                  )}

                  {!isResolved && onResolve && (
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        placeholder="Resolution details..."
                        value={inputNote}
                        onChange={(e) => handleNoteChange(id, e.target.value)}
                        className="flex-1 bg-slate-950/70 border border-borderSlate rounded px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:border-accentCyan placeholder-slate-600 transition-all"
                      />
                      <button
                        onClick={() => {
                          onResolve(id, inputNote);
                          handleNoteChange(id, '');
                        }}
                        className="bg-accentEmerald/15 border border-accentEmerald/30 text-accentEmerald px-2.5 py-0.5 rounded text-[10px] font-bold hover:bg-accentEmerald hover:text-darkBg hover:border-transparent transition-all"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default IncidentTimeline;
