import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  GRID_STROKE, AXIS_TICK_FILL, AXIS_LINE_STROKE, FAILURE_BAR_FILL, TOOLTIP_STYLE,
} from './chartTheme';

interface WorstCaseSummaryProps {
  depletionAges: (number | null)[];
  successRate: number;
}

export function WorstCaseSummary({ depletionAges, successRate }: WorstCaseSummaryProps) {
  const totalSims = depletionAges.length;
  const failureCount = Math.round((1 - successRate) * totalSims);
  const depletions = depletionAges.filter((a): a is number => a !== null);

  // Build histogram: count depletions per age
  const ageCounts = new Map<number, number>();
  for (const age of depletions) {
    ageCounts.set(age, (ageCounts.get(age) || 0) + 1);
  }

  const ages = [...ageCounts.keys()].sort((a, b) => a - b);
  const chartData = ages.map(age => ({ age, count: ageCounts.get(age)! }));

  const avgDepletionAge = depletions.length > 0
    ? Math.round(depletions.reduce((a, b) => a + b, 0) / depletions.length)
    : null;

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        When Money Runs Out
      </h4>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-bold tabular-nums text-gray-700 dark:text-gray-200">
          {failureCount.toLocaleString()}
        </span>
        <span className="text-xs text-gray-400">
          of {totalSims.toLocaleString()} simulations failed
          {avgDepletionAge && ` · avg age ${avgDepletionAge}`}
        </span>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="age"
              tick={{ fill: AXIS_TICK_FILL, fontSize: 11 }}
              tickLine={false}
              minTickGap={20}
              axisLine={{ stroke: AXIS_LINE_STROKE }}
              label={{ value: 'Age', position: 'insideBottom', offset: -2, fill: AXIS_TICK_FILL, fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: AXIS_TICK_FILL, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: '#0f172a', fontWeight: 600 }}
              itemStyle={{ color: '#374151' }}
              formatter={(value: number) => [`${value} simulations`, 'Depleted']}
              labelFormatter={(age: number) => `Age ${age}`}
            />
            <Bar dataKey="count" fill={FAILURE_BAR_FILL} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[180px] text-sm text-green-600 dark:text-green-400 font-medium">
          No simulations ran out of money
        </div>
      )}
    </div>
  );
}
