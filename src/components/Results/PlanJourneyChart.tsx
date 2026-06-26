import React from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { YearResult, ScenarioInput } from '../../types';
import { formatCompact } from '../../utils/format';
import { GRID_STROKE, AXIS_TICK_FILL, TOOLTIP_STYLE } from './chartTheme';
import { RMD_START_AGE } from '../../constants/rmd-table';

const JOURNEY_LINE = '#10b981';   // emerald-500
const JOURNEY_FILL = '#10b981';
const RETIREMENT_LINE = '#9ca3af';

interface JourneyEvent {
  age: number;
  icon: string;
  label: string;
  description: string;
}

interface PlanJourneyChartProps {
  data: YearResult[];
  scenario: ScenarioInput;
  retirementAge: number;
  currentAge: number;
}

export function PlanJourneyChart({ data, scenario, retirementAge, currentAge }: PlanJourneyChartProps) {
  const birthYear = new Date().getFullYear() - currentAge;
  const spouseAgeOffset = scenario.spouse.enabled ? scenario.spouse.currentAge - currentAge : 0;

  const events: JourneyEvent[] = [];
  events.push({
    age: retirementAge,
    icon: '🏖',
    label: 'Retirement',
    description: "You've reached your retirement age!",
  });
  events.push({
    age: scenario.socialSecurityClaimAge,
    icon: '🏛',
    label: 'Social Security starts',
    description: 'Your Social Security benefits begin.',
  });
  if (scenario.spouse.enabled) {
    events.push({
      age: scenario.spouse.socialSecurityClaimAge - spouseAgeOffset,
      icon: '👫',
      label: "Spouse's Social Security",
      description: "Your spouse's Social Security benefits begin.",
    });
  }
  if (scenario.pensionAmount > 0) {
    events.push({
      age: scenario.pensionStartAge,
      icon: '💼',
      label: 'Pension starts',
      description: 'Your pension payments begin.',
    });
  }
  events.push({
    age: RMD_START_AGE,
    icon: '📜',
    label: 'RMDs begin',
    description: 'Required Minimum Distributions from tax-deferred accounts begin.',
  });
  events.push({
    age: scenario.endAge,
    icon: '🎯',
    label: 'End of plan',
    description: `Final year of your plan horizon (age ${scenario.endAge}).`,
  });

  const eventsByAge = new Map<number, JourneyEvent[]>();
  for (const e of events) {
    if (!eventsByAge.has(e.age)) eventsByAge.set(e.age, []);
    eventsByAge.get(e.age)!.push(e);
  }

  const chartData = data.map((y) => ({
    age: y.age,
    year: birthYear + y.age,
    netWorth: y.totalBalance,
    spouseAge: scenario.spouse.enabled ? y.age + spouseAgeOffset : null,
    events: eventsByAge.get(y.age) ?? [],
  }));

  const EventDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload?.events?.length) return null;
    const icons: JourneyEvent[] = payload.events;
    return (
      <g>
        {icons.map((e, i) => {
          const offsetX = (i - (icons.length - 1) / 2) * 20;
          return (
            <g key={i} transform={`translate(${cx + offsetX}, ${cy})`} style={{ pointerEvents: 'none' }}>
              <circle r={10} fill="#ffffff" stroke="#d1d5db" strokeWidth={1} />
              <text textAnchor="middle" y={4} fontSize={11}>{e.icon}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div
        style={{ ...TOOLTIP_STYLE, padding: '10px 12px', minWidth: 220, color: 'inherit' }}
        className="text-gray-800 dark:text-gray-100 dark:!bg-gray-800 dark:!border-gray-600"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{d.year}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Age {d.age}{d.spouseAge != null ? ` · Spouse ${d.spouseAge}` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs border-t border-gray-200 dark:border-gray-700 pt-2">
          <span className="text-gray-600 dark:text-gray-400">Portfolio balance</span>
          <span className="font-semibold">{formatCompact(d.netWorth)}</span>
        </div>
        {d.events.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-[0.625rem] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Events</div>
            <div className="space-y-1">
              {d.events.map((e: JourneyEvent, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-2 bg-gray-50 dark:bg-gray-900/40 rounded-md px-2 py-1.5"
                >
                  <span className="text-base leading-none mt-0.5">{e.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{e.label}</div>
                    <div className="text-[0.6875rem] text-gray-600 dark:text-gray-400 leading-snug">{e.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Portfolio Over Time
        </h4>
        <span className="text-[0.625rem] text-gray-500 dark:text-gray-400">
          Median outcome · Hover for details
        </span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 24, right: 20, left: 30, bottom: 5 }}>
          <defs>
            <linearGradient id="journeyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={JOURNEY_FILL} stopOpacity={0.22} />
              <stop offset="100%" stopColor={JOURNEY_FILL} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 15, fill: AXIS_TICK_FILL, stroke: 'none' }}
            minTickGap={30}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 15, fill: AXIS_TICK_FILL, stroke: 'none' }}
            width={70}
            label={{
              value: 'Projected portfolio balance',
              angle: -90,
              position: 'insideLeft',
              offset: -15,
              style: { fontSize: 15, fill: AXIS_TICK_FILL, textAnchor: 'middle' },
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9ca3af', strokeDasharray: '3 3' }} />
          <ReferenceLine
            x={birthYear + retirementAge}
            stroke={RETIREMENT_LINE}
            strokeDasharray="4 4"
            label={{
              value: 'Retirement',
              position: 'top',
              fontSize: 15,
              fill: AXIS_TICK_FILL,
            }}
          />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="none"
            fill="url(#journeyFill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            stroke={JOURNEY_LINE}
            strokeWidth={2.5}
            dot={<EventDot />}
            activeDot={{ r: 5, fill: JOURNEY_LINE, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[0.6875rem] text-gray-500 dark:text-gray-400 mt-2 px-1">
        This is the typical outcome — half of simulated scenarios do better, half do worse.
      </p>
    </div>
  );
}
