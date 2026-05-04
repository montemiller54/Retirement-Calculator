import React from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { PercentileBand } from '../../types';
import { formatCompact } from '../../utils/format';

interface FanChartProps {
  data: PercentileBand[];
  retirementAge: number;
}

export function FanChart({ data, retirementAge }: FanChartProps) {
  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Portfolio Value Over Time (Range of Outcomes)
      </h4>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 10, fill: '#d1d5db', stroke: 'none' }}
            minTickGap={20}
            label={{ value: 'Age', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: '#d1d5db' }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 10, fill: '#d1d5db', stroke: 'none' }}
            width={55}
          />
          <Tooltip
            formatter={(val: number) => formatCompact(val)}
            labelFormatter={(label) => `Age ${label}`}
            contentStyle={{ fontSize: 11 }}
            itemStyle={{ color: '#374151' }}
          />
          <ReferenceLine
            x={retirementAge}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ value: 'Retire', position: 'top', fontSize: 10, fill: '#ef4444' }}
          />
          {/* Outer band: p75-p90 */}
          <Area
            type="monotone"
            dataKey="p75"
            stroke="none"
            fill="#93c5fd"
            fillOpacity={0.4}
            name="Best 25%"
          />
          {/* Mid band: p25-p75 */}
          <Area
            type="monotone"
            dataKey="p25"
            stroke="none"
            fill="#dbeafe"
            fillOpacity={0.6}
            name="Worst 25%"
          />
          {/* Bottom band: p10 with shading below */}
          <Area
            type="monotone"
            dataKey="p10"
            stroke="#1e40af"
            strokeWidth={1.5}
            fill="#1e3a5f"
            fillOpacity={0.5}
            name="Worst 10%"
          />
          {/* Median as dashed line only */}
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#60a5fa"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            name="Typical (Median)"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400 mt-2 px-1">The dashed blue line shows the median outcome. The dark shaded area shows the worst 10% of simulations. Lighter bands show the range of possibilities.</p>
    </div>
  );
}
