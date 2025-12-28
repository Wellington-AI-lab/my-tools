import { clsx } from 'clsx';
import { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'flat';
  };
  status?: 'ok' | 'warning' | 'error' | 'info';
  className?: string;
}

const STATUS_CONFIG = {
  ok: { color: 'border-green-500/30 bg-green-500/5', text: 'text-green-400' },
  warning: { color: 'border-yellow-500/30 bg-yellow-500/5', text: 'text-yellow-400' },
  error: { color: 'border-red-500/30 bg-red-500/5', text: 'text-red-400' },
  info: { color: 'border-blue-500/30 bg-blue-500/5', text: 'text-blue-400' },
};

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  trend,
  status = 'info',
  className,
}: StatCardProps) {
  const config = STATUS_CONFIG[status];
  const displayValue = useMemo(() => {
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    return value;
  }, [value]);

  return (
    <div className={clsx(
      "border rounded-lg p-3 bg-gray-900/50",
      config.color,
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <Icon className={clsx("w-3.5 h-3.5", config.text)} />
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1">
        <span className={clsx("text-xl font-mono font-bold", config.text)}>
          {displayValue}
        </span>
        {unit && (
          <span className="text-xs font-mono text-gray-500">{unit}</span>
        )}
      </div>

      {/* Trend */}
      {trend && (
        <div className={clsx(
          "text-[10px] font-mono mt-1",
          trend.direction === 'up' ? "text-green-400" :
          trend.direction === 'down' ? "text-red-400" : "text-gray-500"
        )}>
          {trend.direction === 'up' && '↑'}
          {trend.direction === 'down' && '↓'}
          {trend.direction === 'flat' && '→'}
          {' '}
          {Math.abs(trend.value)}{typeof trend.value === 'number' && !unit?.includes('%') ? '%' : ''}
        </div>
      )}
    </div>
  );
}

interface StatGridProps {
  stats: Array<{
    label: string;
    value: number | string;
    unit?: string;
    icon?: LucideIcon;
    trend?: {
      value: number;
      direction: 'up' | 'down' | 'flat';
    };
    status?: 'ok' | 'warning' | 'error' | 'info';
  }>;
  className?: string;
}

export function StatGrid({ stats, className }: StatGridProps) {
  return (
    <div className={clsx("grid grid-cols-2 md:grid-cols-4 gap-2", className)}>
      {stats.map((stat, idx) => (
        <StatCard key={idx} {...stat} />
      ))}
    </div>
  );
}
