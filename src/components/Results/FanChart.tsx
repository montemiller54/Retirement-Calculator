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
  currentAge: number;
}

const TOOLTIP_ORDER = ['p75', 'p50', 'p25', 'p10'];
const TOOLTIP_LABELS: Record<string, string> = {
  p75: 'Best 25%',
  p50: 'Typical (Median)',
  p25: 'Worst 25%',
  p10: 'Worst 10%',
};

export function FanChart({ data, retirementAge, currentAge }: FanChartProps) {
  const birthYear = new Date().getFullYear() - currentAge;
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
            tick={{ fontSize: 10, fill: '#888', stroke: 'none' }}
            minTickGap={20}
            label={{ value: 'Age', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: '#888' }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 10, fill: '#888', stroke: 'none' }}
            width={55}
          />
          <Tooltip
            formatter={(val: number, name: string) => [formatCompact(val), TOOLTIP_LABELS[name] ?? name]}
            itemSorter={(item) => {
              const idx = TOOLTIP_ORDER.indexOf(item.dataKey as string);
              return idx >= 0 ? idx : 99;
            }}
            labelFormatter={(label) => `Age ${label}  ·  Year ${birthYear + Number(label)}`}
            contentStyle={{ fontSize: 11 }}
            labelStyle={{ color: '#000' }}
            itemStyle={{ color: '#374151' }}
          />
          <ReferenceLine
            x={retirementAge}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ value: 'Retire', position: 'top', fontSize: 10, fill: '#ef4444' }}
          />
          {/* p75 band — light blue */}
          <Area
            type="monotone"
            dataKey="p75"
            stroke="none"
            fill="#93c5fd"
            fillOpacity={0.4}
            name="p75_area"
            tooltipType="none"
          />
          {/* p25 band — medium blue */}
          <Area
            type="monotone"
            dataKey="p25"
            stroke="none"
            fill="#bfdbfe"
            fillOpacity={0.6}
            name="p25_area"
            tooltipType="none"
          />
          {/* p10 band — purple shading */}
          <Area
            type="monotone"
            dataKey="p10"
            stroke="none"
            fill="#7c3aed"
            fillOpacity={0.35}
            name="p10_area"
            tooltipType="none"
          />
          {/* Lines for all percentiles */}
          <Line type="monotone" dataKey="p75" stroke="#3b82f6" strokeWidth={1} dot={false} name="p75" legendType="none" />
          <Line type="monotone" dataKey="p50" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" dot={false} name="p50" />
          <Line type="monotone" dataKey="p25" stroke="#60a5fa" strokeWidth={1} dot={false} name="p25" legendType="none" />
          <Line type="monotone" dataKey="p10" stroke="#7c3aed" strokeWidth={1.5} dot={false} name="p10" legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400 mt-2 px-1">The dashed gold line shows the median outcome. The purple shaded area shows the worst 10% of simulations. Lighter bands show the range of possibilities.</p>
    </div>
  );
}
