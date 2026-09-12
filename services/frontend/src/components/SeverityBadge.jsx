import React from 'react';

const SEVERITY_STYLES = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-600',
    label: 'Critical',
  },
  high: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    label: 'High',
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    dot: 'bg-yellow-500',
    label: 'Medium',
  },
  low: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    dot: 'bg-blue-600',
    label: 'Low',
  },
  resolved: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    dot: 'bg-green-600',
    label: 'Resolved',
  },
  active: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-600',
    label: 'Active',
  },
  acknowledged: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    dot: 'bg-purple-600',
    label: 'Acknowledged',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    dot: 'bg-yellow-500',
    label: 'Warning',
  },
  healthy: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    dot: 'bg-green-600',
    label: 'Healthy',
  }
};

export const SeverityBadge = ({ severity = 'low', label, size = 'sm', className = '' }) => {
  const normalizedKey = (severity || 'low').toString().toLowerCase();
  const config = SEVERITY_STYLES[normalizedKey] || SEVERITY_STYLES.low;
  const displayLabel = label || config.label || severity;

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-xs px-2.5 py-1 font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border font-medium uppercase tracking-wider ${config.bg} ${config.border} ${config.text} ${sizeClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      <span>{displayLabel}</span>
    </span>
  );
};

export default SeverityBadge;
