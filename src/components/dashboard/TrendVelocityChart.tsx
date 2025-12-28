import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { useMemo } from 'react';

interface TagSnapshot {
  tag: string;
  score: number;
  rank: number;
  first_seen?: string;
  categories?: string[];
}

interface VelocityData {
  tag: string;
  currentScore: number;
  prevScore: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
  history: { time: string; score: number }[];
}

interface TrendVelocityChartProps {
  snapshots?: TagSnapshot[];
  previousSnapshots?: TagSnapshot[];
  timeRange?: '24h' | '7d';
  className?: string;
}

const THEME_COLORS = {
  finance: '#22c55e',
  economy: '#3b82f6',
  ai: '#a855f7',
  robotics: '#f59e0b',
  travel: '#06b6d4',
  music: '#ec4899',
  movies: '#ef4444',
  fashion: '#8b5cf6',
  entertainment: '#f97316',
};

export function TrendVelocityChart({
  snapshots = [],
  previousSnapshots = [],
  timeRange = '24h',
  className,
}: TrendVelocityChartProps) {
  const velocityData = useMemo(() => {
    const prevMap = new Map(previousSnapshots.map(s => [s.tag, s]));

    return snapshots
      .slice(0, 12)
      .map(snapshot => {
        const prev = prevMap.get(snapshot.tag);
        const prevScore = prev?.score || 0;
        const change = snapshot.score - prevScore;
        const changePercent = prevScore > 0 ? (change / prevScore) * 100 : 100;
        let trend: 'up' | 'down' | 'flat' = 'flat';
        if (change > 5) trend = 'up';
        else if (change < -5) trend = 'down';

        // Mock history for visualization
        const history = [
          { time: '-6h', score: Math.round(prevScore * 0.9) },
          { time: '-4h', score: Math.round(prevScore * 0.95) },
          { time: '-2h', score: prevScore },
          { time: 'Now', score: snapshot.score },
        ];

        return {
          tag: snapshot.tag,
          currentScore: snapshot.score,
          prevScore,
          change,
          changePercent,
          trend,
          history,
          categories: snapshot.categories || [],
        };
      })
      .sort((a, b) => b.change - a.change);
  }, [snapshots, previousSnapshots]);

  const chartData = useMemo(() => {
    if (velocityData.length === 0) return [];

    const timestamps = velocityData[0]?.history.map(h => h.time) || [];
    return timestamps.map(time => {
      const point: Record<string, unknown> = { time };
      velocityData.forEach((vd, i) => {
        const h = vd.history.find(h => h.time === time);
        point[`tag${i}`] = h?.score || 0;
      });
      return point;
    });
  }, [velocityData]);

  const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-3 h-3 text-green-400" />;
      case 'down':
        return <TrendingDown className="w-3 h-3 text-red-400" />;
      default:
        return <Minus className="w-3 h-3 text-gray-500" />;
    }
  };

  const getCategoryColor = (categories: string[]) => {
    for (const cat of categories) {
      if (cat in THEME_COLORS) return THEME_COLORS[cat as keyof typeof THEME_COLORS];
    }
    return '#6b7280';
  };

  if (velocityData.length === 0) {
    return (
      <div className={clsx("bg-gray-900/50 border border-gray-800 rounded-lg p-4", className)}>
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm font-mono">
          [NO DATA] Waiting for snapshots...
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400">TAG_VELOCITY</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono">
            {timeRange}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-gray-500 font-mono">
            TOP {velocityData.length} TAGS
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#1f2937" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              stroke="#374151"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              stroke="#374151"
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderRadius: '4px',
              }}
              labelStyle={{ color: '#9ca3af', fontSize: 11 }}
              itemStyle={{ fontSize: 10 }}
            />
            {velocityData.slice(0, 5).map((vd, i) => (
              <Line
                key={vd.tag}
                type="monotone"
                dataKey={`tag${i}`}
                stroke={getCategoryColor(vd.categories)}
                strokeWidth={1.5}
                dot={false}
                name={vd.tag}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Velocity Table */}
      <div className="border-t border-gray-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-3 py-1.5 text-left font-mono text-gray-500 font-normal">TAG</th>
              <th className="px-3 py-1.5 text-right font-mono text-gray-500 font-normal">SCORE</th>
              <th className="px-3 py-1.5 text-right font-mono text-gray-500 font-normal">Δ</th>
              <th className="px-3 py-1.5 text-right font-mono text-gray-500 font-normal">Δ%</th>
              <th className="px-3 py-1.5 text-center font-mono text-gray-500 font-normal">TREND</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {velocityData.map((vd) => (
              <tr
                key={vd.tag}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: getCategoryColor(vd.categories) }}
                    />
                    <span className="text-gray-300 truncate max-w-[120px]">{vd.tag}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right text-gray-400">{vd.currentScore}</td>
                <td className={clsx(
                  "px-3 py-1.5 text-right",
                  vd.change > 0 ? "text-green-400" : vd.change < 0 ? "text-red-400" : "text-gray-500"
                )}>
                  {vd.change > 0 ? '+' : ''}{vd.change}
                </td>
                <td className={clsx(
                  "px-3 py-1.5 text-right",
                  vd.changePercent > 0 ? "text-green-400" : vd.changePercent < 0 ? "text-red-400" : "text-gray-500"
                )}>
                  {vd.changePercent > 0 ? '+' : ''}{vd.changePercent.toFixed(1)}%
                </td>
                <td className="px-3 py-1.5 text-center">{getTrendIcon(vd.trend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
