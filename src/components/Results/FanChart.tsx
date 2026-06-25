import React from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { PercentileBand } from '../../types';
import { formatCompact } from '../../utils/format';
import {
  GRID_STROKE, AXIS_TICK_FILL, RETIREMENT_MARKER_STROKE, RETIREMENT_MARKER_FILL,
  FAN_BAND_COLOR, FAN_BAND_OUTER_OPACITY, FAN_BAND_INNER_OPACITY, FAN_BAND_WORST_OPACITY,
  FAN_MEDIAN_STROKE, TOOLTIP_STYLE,
} from './chartTheme';

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
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Portfolio Value Over Time (Simulated)
        </h4>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
          <LegendSwatch color={FAN_MEDIAN_STROKE} kind="line" label="Median" />
          <LegendSwatch color={FAN_BAND_COLOR} kind="band" opacity={FAN_BAND_INNER_OPACITY} label="25–75%" />
          <LegendSwatch color={FAN_BAND_COLOR} kind="band" opacity={FAN_BAND_OUTER_OPACITY} label="10–90%" />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 10, fill: AXIS_TICK_FILL, stroke: 'none' }}
            minTickGap={20}
            label={{ value: 'Age', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: AXIS_TICK_FILL }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 10, fill: AXIS_TICK_FILL, stroke: 'none' }}
            width={55}
          />
          <Tooltip
            formatter={(val: number, name: string) => [formatCompact(val), TOOLTIP_LABELS[name] ?? name]}
            itemSorter={(item) => {
              const idx = TOOLTIP_ORDER.indexOf(item.dataKey as string);
              return idx >= 0 ? idx : 99;
            }}
            labelFormatter={(label) => `Age ${label}  ·  Year ${birthYear + Number(label)}`}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#0f172a', fontWeight: 600 }}
            itemStyle={{ color: '#374151' }}
          />
          <ReferenceLine
            x={retirementAge}
            stroke={RETIREMENT_MARKER_STROKE}
            strokeDasharray="4 4"
            label={{ value: 'Retire', position: 'top', fontSize: 10, fill: RETIREMENT_MARKER_FILL }}
          />
          <Area type="monotone" dataKey="p75" stroke="none" fill={FAN_BAND_COLOR} fillOpacity={FAN_BAND_OUTER_OPACITY} name="p75_area" tooltipType="none" />
          <Area type="monotone" dataKey="p25" stroke="none" fill={FAN_BAND_COLOR} fillOpacity={FAN_BAND_INNER_OPACITY} name="p25_area" tooltipType="none" />
          <Area type="monotone" dataKey="p10" stroke="none" fill={FAN_BAND_COLOR} fillOpacity={FAN_BAND_WORST_OPACITY} name="p10_area" tooltipType="none" />
          <Line type="monotone" dataKey="p50" stroke={FAN_MEDIAN_STROKE} strokeWidth={2.5} dot={false} name="p50" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400 mt-2 px-1">Range of outcomes across 5,000 simulations. The solid line is the median (typical outcome). The darker band covers the middle 50% of outcomes; the lighter band covers 80%.</p>
    </div>
  );
}

function LegendSwatch({ color, kind, opacity = 1, label }: { color: string; kind: 'line' | 'band'; opacity?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {kind === 'line' ? (
        <span className="inline-block w-4 h-[2.5px] rounded-sm" style={{ background: color }} />
      ) : (
        <span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: color, opacity }} />
      )}
      <span>{label}</span>
    </span>
  );
}
