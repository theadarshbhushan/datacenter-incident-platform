import React from 'react';
import { Inbox } from 'lucide-react';

export const EmptyState = ({
  icon: Icon = Inbox,
  title = 'No items found',
  description = 'There are currently no records matching the specified criteria.',
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center card bg-white ${className}`}>
      <div className="w-12 h-12 rounded-full bg-[#F4F4F4] text-[#525252] flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-[#161616] mb-1">{title}</h3>
      <p className="text-xs text-[#525252] max-w-sm mb-4 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary text-xs">
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
