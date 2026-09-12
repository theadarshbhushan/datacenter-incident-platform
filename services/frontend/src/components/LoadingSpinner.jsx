import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ message = 'Loading...', size = 'md', className = '' }) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-[#525252] ${className}`}>
      <Loader2 className={`${sizeMap[size] || sizeMap.md} animate-spin text-[#0F62FE] mb-2`} />
      {message && <p className="text-xs font-medium tracking-wide">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
