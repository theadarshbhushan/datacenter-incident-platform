import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export const MetricChart = ({ data = [], forecastData = [], type = 'multi' }) => {
  const formatTime = (timeStr) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  // Build combined series for Recharts
  const chartData = [
    ...data.map((d) => ({
      timestamp: d.timestamp,
      cpu_pct: d.cpu_pct,
      ram_pct: d.ram_pct,
      temp_celsius: d.temp_celsius,
      isForecast: false,
    })),
    ...forecastData.map((d) => ({
      timestamp: d.timestamp,
      cpu_pct_forecast: d.cpu_pct,
      ram_pct_forecast: d.ram_pct,
      isForecast: true,
    })),
  ];

  const getStrokeColor = (key) => {
    switch (key) {
      case 'cpu': return '#00E5FF';
      case 'ram': return '#10B981';
      case 'temp': return '#F59E0B';
      case 'cpu_f': return '#0097A7';
      case 'ram_f': return '#0F766E';
      default: return '#8884d8';
    }
  };

  return (
    <div className="w-full h-72 glass-panel p-4 rounded-xl flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Telemetry Profile ({type.toUpperCase()})
        </h3>
        {forecastData.length > 0 && (
          <span className="text-[10px] bg-accentCyan/15 border border-accentCyan/30 text-accentCyan px-2 py-0.5 rounded font-semibold animate-pulse">
            +30M Forecast Active
          </span>
        )}
      </div>

      <div className="flex-1 w-full text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatTime} 
              stroke="#64748b" 
              fontSize={10}
            />
            <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ backgroundColor: '#151C2C', borderColor: '#222D44', borderRadius: '8px' }}
              labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
              labelFormatter={(value) => `Time: ${new Date(value).toLocaleTimeString()}`}
            />
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
            
            {(type === 'cpu' || type === 'multi') && (
              <Line
                name="CPU Actual (%)"
                type="monotone"
                dataKey="cpu_pct"
                stroke={getStrokeColor('cpu')}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
            
            {(type === 'ram' || type === 'multi') && (
              <Line
                name="RAM Actual (%)"
                type="monotone"
                dataKey="ram_pct"
                stroke={getStrokeColor('ram')}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
            
            {type === 'temp' && (
              <Line
                name="Temp Actual (°C)"
                type="monotone"
                dataKey="temp_celsius"
                stroke={getStrokeColor('temp')}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}

            {/* Forecasted Metrics */}
            {(type === 'cpu' || type === 'multi') && forecastData.length > 0 && (
              <Line
                name="CPU Forecast (%)"
                type="monotone"
                dataKey="cpu_pct_forecast"
                stroke={getStrokeColor('cpu_f')}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            )}

            {(type === 'ram' || type === 'multi') && forecastData.length > 0 && (
              <Line
                name="RAM Forecast (%)"
                type="monotone"
                dataKey="ram_pct_forecast"
                stroke={getStrokeColor('ram_f')}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MetricChart;
