import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from 'recharts';
import type { YearResult } from '../../types';
import { formatCompact } from '../../utils/format';

interface AccountDrawdownChartProps {
  data: YearResult[];
  retirementAge: number;
}

const ACCOUNT_COLORS: Record<string, string> = {
  traditional401k: '#3b82f6',
  roth401k: '#8b5cf6',
  traditionalIRA: '#06b6d4',
  rothIRA: '#10b981',
  taxable: '#f59e0b',
  hsa: '#ec4899',
  cashAccount: '#6366f1',
  otherAssets: '#a3a3a3',
};

const ACCOUNT_NAMES: Record<string, string> = {
  traditional401k: '401(k) Traditional',
  roth401k: '401(k) Roth',
  traditionalIRA: 'Traditional IRA',
  rothIRA: 'Roth IRA',
  taxable: 'Taxable',
  hsa: 'HSA',
  cashAccount: 'Cash Account',
  otherAssets: 'Other Assets',
};

export function AccountDrawdownChart({ data, retirementAge }: AccountDrawdownChartProps) {
  const chartData = data.map(d => ({
    age: d.age,
    traditional401k: d.balances.traditional401k,
    roth401k: d.balances.roth401k,
    traditionalIRA: d.balances.traditionalIRA,
    rothIRA: d.balances.rothIRA,
    taxable: d.balances.taxable,
    hsa: d.balances.hsa,
    cashAccount: d.balances.cashAccount,
    otherAssets: d.balances.otherAssets,
  }));

  // Only show accounts that have a nonzero balance at some point
  const visibleAccounts = Object.keys(ACCOUNT_COLORS).filter(acct =>
    chartData.some(d => (d as Record<string, number>)[acct] > 0)
  );

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Account Balances Over Time (Average Across All Simulations)
      </h4>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 10 }}
            label={{ value: 'Age', position: 'insideBottomRight', offset: -5, fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 10 }}
            width={55}
          />
          <Tooltip
            formatter={(val: number, name: string) => [formatCompact(val), ACCOUNT_NAMES[name] ?? name]}
            labelFormatter={(label) => `Age ${label}`}
            contentStyle={{ fontSize: 11 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10 }}
            formatter={(value: string) => ACCOUNT_NAMES[value] ?? value}
          />
          <ReferenceLine
            x={retirementAge}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ value: 'Retire', position: 'top', fontSize: 10, fill: '#ef4444' }}
          />
          {visibleAccounts.map((acct) => (
            <Area
              key={acct}
              type="monotone"
              dataKey={acct}
              stackId="1"
              fill={ACCOUNT_COLORS[acct]}
              stroke={ACCOUNT_COLORS[acct]}
              fillOpacity={0.7}
              name={acct}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
