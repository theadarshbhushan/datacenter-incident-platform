import React from 'react';

export const MetricBar = ({
  label,
  value = 0,
  max = 100,
  unit = '%',
  showLabel = true,
  showValue = true,
  height = 'h-2',
  className = '',
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  // Dynamic threshold colors
  let colorClass = 'bg-[#24A148]'; // Green < 70%
  let textClass = 'text-[#24A148]';
  if (percentage >= 85) {
    colorClass = 'bg-[#DA1E28]'; // Red >= 85%
    textClass = 'text-[#DA1E28]';
  } else if (percentage >= 70) {
    colorClass = 'bg-[#F1C21B]'; // Yellow 70-85%
    textClass = 'text-[#B28900]';
  }

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || showValue) && (
        <div className="flex items-center justify-between text-xs mb-1 font-medium">
          {showLabel && <span className="text-[#525252]">{label}</span>}
          {showValue && (
            <span className={`font-semibold ${textClass}`}>
              {typeof value === 'number' ? value.toFixed(1) : value}
              {unit}
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-[#E0E0E0] rounded-[2px] overflow-hidden ${height}`}>
        <div
          className={`h-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default MetricBar;
