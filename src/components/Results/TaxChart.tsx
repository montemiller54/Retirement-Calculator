import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import type { YearResult } from '../../types';
import { formatCompact } from '../../utils/format';
import { GRID_STROKE, AXIS_TICK_FILL, TOOLTIP_STYLE } from './chartTheme';

interface TaxChartProps {
  data: YearResult[];
  currentAge: number;
}

export function TaxChart({ data, currentAge }: TaxChartProps) {
  const birthYear = new Date().getFullYear() - currentAge;
  const chartData = data.map(d => ({
    age: d.age,
    federal: Math.round(d.taxes.federal),
    state: Math.round(d.taxes.state),
    fica: Math.round(d.taxes.fica),
  }));

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Taxes Over Time (Average)
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="age" tick={{ fontSize: 10, fill: AXIS_TICK_FILL, stroke: 'none' }} minTickGap={20} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10, fill: AXIS_TICK_FILL, stroke: 'none' }} width={55} />
          <Tooltip formatter={(val: number) => formatCompact(val)} labelFormatter={(label) => `Age ${label}  · Year ${birthYear + Number(label)}`} contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#0f172a', fontWeight: 600 }} itemStyle={{ color: '#374151' }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="federal" stackId="1" fill="#3b82f6" name="Federal" />
          <Bar dataKey="state" stackId="1" fill="#10b981" name="State" />
          <Bar dataKey="fica" stackId="1" fill="#f59e0b" name="SS & Medicare Tax" />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400 mt-2 px-1">Smooth projection using average market returns. Includes federal, state, and payroll taxes.</p>
    </div>
  );
}
