import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Line, ComposedChart,
} from 'recharts';
import type { YearResult } from '../../types';
import { formatCompact } from '../../utils/format';

interface CashflowChartProps {
  data: YearResult[];
  retirementAge: number;
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

export function CashflowChart({ data, retirementAge }: CashflowChartProps) {
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
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="age" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10 }} width={55} />
          <Tooltip
            formatter={(val: number, name: string) => [formatCompact(val), name]}
            labelFormatter={(label) => `Age ${label}`}
            contentStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
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
    </div>
  );
}
