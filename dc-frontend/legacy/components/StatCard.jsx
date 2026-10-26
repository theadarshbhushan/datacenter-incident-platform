import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const StatCard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendDirection = 'neutral', // 'up' | 'down' | 'neutral'
  trendInverted = false, // If true, up is bad (red) and down is good (green) e.g. for incidents or errors
  subtitle,
  badge,
  badgeColor = 'blue',
  className = '',
  onClick,
}) => {
  const getTrendColor = () => {
    if (trendDirection === 'neutral') return 'text-[#525252] bg-[#F4F4F4]';
    const isPositive = trendDirection === 'up';
    const isGood = trendInverted ? !isPositive : isPositive;
    return isGood
      ? 'text-[#24A148] bg-[#DEFBE6]'
      : 'text-[#DA1E28] bg-[#FFF1F1]';
  };

  const TrendIcon = trendDirection === 'up' ? TrendingUp : trendDirection === 'down' ? TrendingDown : Minus;

  return (
    <div
      onClick={onClick}
      className={`card p-5 transition-shadow hover:shadow-md ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#525252] uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <div className="w-8 h-8 rounded-[4px] bg-[#EDF5FF] text-[#0F62FE] flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="text-2xl font-bold text-[#161616] tracking-tight">{value}</span>
        {badge && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-[2px] bg-[#EDF5FF] text-[#0F62FE]">
            {badge}
          </span>
        )}
      </div>

      {(trend || subtitle) && (
        <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-[#F4F4F4]">
          {trend && (
            <span className={`inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-[2px] ${getTrendColor()}`}>
              <TrendIcon className="w-3 h-3" />
              {trend}
            </span>
          )}
          {subtitle && (
            <span className="text-[#6F6F6F] ml-auto truncate">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default StatCard;
