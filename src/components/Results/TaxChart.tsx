import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import type { YearResult } from '../../types';
import { formatCompact } from '../../utils/format';

interface TaxChartProps {
  data: YearResult[];
}

export function TaxChart({ data }: TaxChartProps) {
  const chartData = data.map(d => ({
    age: d.age,
    federal: Math.round(d.taxes.federal),
    state: Math.round(d.taxes.state),
    fica: Math.round(d.taxes.fica),
  }));

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Taxes Over Time (Typical Outcome)
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="age" tick={{ fontSize: 10, fill: '#9ca3af' }} minTickGap={20} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10, fill: '#9ca3af' }} width={55} />
          <Tooltip formatter={(val: number) => formatCompact(val)} labelFormatter={(label) => `Age ${label}`} contentStyle={{ fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="federal" stackId="1" fill="#3b82f6" name="Federal" />
          <Bar dataKey="state" stackId="1" fill="#10b981" name="State" />
          <Bar dataKey="fica" stackId="1" fill="#f59e0b" name="SS & Medicare Tax" />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400 mt-2 px-1">Estimated tax burden over time assuming average market returns. Includes federal, state, and payroll taxes.</p>
    </div>
  );
}
