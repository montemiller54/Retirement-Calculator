import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from 'recharts';
import type { YearResult } from '../../types';
import { ACCOUNT_LABELS } from '../../types';
import { formatCompact } from '../../utils/format';
import {
  GRID_STROKE, AXIS_TICK_FILL, RETIREMENT_MARKER_STROKE, RETIREMENT_MARKER_FILL, TOOLTIP_STYLE,
} from './chartTheme';

interface AccountDrawdownChartProps {
  data: YearResult[];
  retirementAge: number;
  currentAge: number;
}

const ACCOUNT_COLORS: Record<string, string> = {
  traditional401k: '#f97316', // orange — pre-tax (warm)
  traditionalIRA: '#f59e0b',  // amber — pre-tax (warm)
  roth401k: '#10b981',        // emerald — tax-free (cool)
  rothIRA: '#14b8a6',         // teal — tax-free (cool)
  taxable: '#0ea5e9',         // sky — taxable brokerage
  hsa: '#ec4899',             // pink — HSA
  cashAccount: '#64748b',     // slate — cash/low-risk
  otherAssets: '#8b5cf6',     // violet — other
};

export function AccountDrawdownChart({ data, retirementAge, currentAge }: AccountDrawdownChartProps) {
  const birthYear = new Date().getFullYear() - currentAge;
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
        Account Balances Over Time (Simulated)
      </h4>
      <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        <AreaChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 20 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 15, fill: AXIS_TICK_FILL, stroke: 'none' }}
            minTickGap={20}
            label={{ value: 'Age', position: 'insideBottom', offset: -15, fontSize: 17, fill: AXIS_TICK_FILL }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 15, fill: AXIS_TICK_FILL, stroke: 'none' }}
            width={55}
          />
          <Tooltip
            formatter={(val: number, name: string) => [formatCompact(val), ACCOUNT_LABELS[name as keyof typeof ACCOUNT_LABELS] ?? name]}
            labelFormatter={(label) => `Age ${label}  · Year ${birthYear + Number(label)}`}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#0f172a', fontWeight: 600 }}
            itemStyle={{ color: '#374151' }}
          />
          <Legend
            verticalAlign="top"
            align="center"
            wrapperStyle={{ fontSize: 15, paddingBottom: 8 }}
            iconSize={12}
            formatter={(value: string) => (
              <span style={{ marginRight: 16 }}>
                {ACCOUNT_LABELS[value as keyof typeof ACCOUNT_LABELS] ?? value}
              </span>
            )}
          />
          <ReferenceLine
            x={retirementAge}
            stroke={RETIREMENT_MARKER_STROKE}
            strokeDasharray="4 4"
            label={{ value: 'Retire', position: 'top', fontSize: 15, fill: RETIREMENT_MARKER_FILL }}
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
      <p className="text-[0.625rem] text-gray-400 mt-2 px-1">A representative path from 5,000 simulations — includes market volatility and guardrail spending adjustments. Different colors represent different account types.</p>
    </div>
  );
}
