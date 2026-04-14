import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { formatCompact } from '../../utils/format';

interface HistogramChartProps {
  endingBalances: number[];
}

export function HistogramChart({ endingBalances }: HistogramChartProps) {
  const bins = useMemo(() => {
    const sorted = [...endingBalances].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const numBins = 25;
    const binWidth = (max - min) / numBins || 1;

    const result: { label: string; count: number; value: number }[] = [];
    for (let i = 0; i < numBins; i++) {
      const lo = min + i * binWidth;
      const hi = lo + binWidth;
      const count = sorted.filter(v => v >= lo && (i === numBins - 1 ? v <= hi : v < hi)).length;
      result.push({
        label: formatCompact(lo),
        count,
        value: lo,
      });
    }
    return result;
  }, [endingBalances]);

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Distribution of Ending Balances
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={bins} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 8 }}
            interval={4}
          />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            labelFormatter={(_, payload) => {
              if (payload?.[0]) return `Balance: ${formatCompact(payload[0].payload.value)}`;
              return '';
            }}
            contentStyle={{ fontSize: 11 }}
          />
          <Bar dataKey="count" name="Simulations">
            {bins.map((entry, i) => (
              <Cell key={i} fill={entry.value < 0 ? '#ef4444' : '#3b82f6'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
