import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Line, ComposedChart,
} from 'recharts';
import type { YearResult } from '../../types';
import { formatCompact } from '../../utils/format';
import { GRID_STROKE, AXIS_TICK_FILL, TOOLTIP_STYLE } from './chartTheme';

interface CashflowChartProps {
  data: YearResult[];
  retirementAge: number;
  currentAge: number;
}

const SERIES = [
  { key: 'socialSecurity', name: 'Social Security', color: '#60a5fa' },
  { key: 'pension', name: 'Pension', color: '#34d399' },
  { key: 'other', name: 'Other Income', color: '#a78bfa' },
  { key: 'traditional401k', name: '401(k) Traditional', color: '#3b82f6' },
  { key: 'roth401k', name: '401(k) Roth', color: '#8b5cf6' },
  { key: 'traditionalIRA', name: 'Traditional IRA', color: '#06b6d4' },
  { key: 'rothIRA', name: 'Roth IRA', color: '#10b981' },
  { key: 'taxable', name: 'Taxable', color: '#f59e0b' },
  { key: 'hsa', name: 'Health Savings Acct', color: '#ec4899' },
  { key: 'cashAccount', name: 'Cash Account', color: '#6366f1' },
  { key: 'otherAssets', name: 'Other Assets', color: '#a3a3a3' },
] as const;

export function CashflowChart({ data, retirementAge, currentAge }: CashflowChartProps) {
  const birthYear = new Date().getFullYear() - currentAge;
  const chartData = data
    .filter(d => d.age >= retirementAge)
    .map(d => ({
      age: d.age,
      socialSecurity: d.income.socialSecurity,
      pension: d.income.pension,
      other: d.income.other,
      traditional401k: d.withdrawals.traditional401k,
      roth401k: d.withdrawals.roth401k,
      traditionalIRA: d.withdrawals.traditionalIRA,
      rothIRA: d.withdrawals.rothIRA,
      taxable: d.withdrawals.taxable,
      hsa: d.withdrawals.hsa,
      cashAccount: d.withdrawals.cashAccount,
      otherAssets: d.withdrawals.otherAssets,
      spending: d.spending,
    }));

  // Only show series that have a nonzero value somewhere
  const visibleSeries = SERIES.filter(s =>
    chartData.some(d => (d as Record<string, number>)[s.key] > 0)
  );

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Retirement Income Sources (Average)
      </h4>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="age" tick={{ fontSize: 15, fill: AXIS_TICK_FILL, stroke: 'none' }} minTickGap={20} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 15, fill: AXIS_TICK_FILL, stroke: 'none' }} width={55} />
          <Tooltip
            formatter={(val: number, name: string) => [formatCompact(val), name]}
            labelFormatter={(label) => `Age ${label}  ·  Year ${birthYear + Number(label)}`}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#0f172a', fontWeight: 600 }}
            itemStyle={{ color: '#374151' }}
          />
          <Legend wrapperStyle={{ fontSize: 15 }} />
          {visibleSeries.map(s => (
            <Bar key={s.key} dataKey={s.key} stackId="income" fill={s.color} name={s.name} />
          ))}
          <Line
            type="monotone"
            dataKey="spending"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Spending"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[0.625rem] text-gray-400 mt-2 px-1">Smooth projection using average market returns. Shows where your retirement income comes from each year. The dashed red line is your total spending.</p>
    </div>
  );
}
