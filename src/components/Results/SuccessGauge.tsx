import React from 'react';

interface SuccessGaugeProps {
  rate: number; // 0-1
  numSimulations: number;
}

const ZONE_COLORS = {
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
};

const CX = 100;
const CY = 100;
const RADIUS = 80;
const STROKE = 16;

function valueToPoint(v: number) {
  const angle = (180 - v * 1.8) * Math.PI / 180;
  return {
    x: CX + RADIUS * Math.cos(angle),
    y: CY - RADIUS * Math.sin(angle),
  };
}

function arcPath(from: number, to: number) {
  const a = valueToPoint(from);
  const b = valueToPoint(to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${RADIUS} ${RADIUS} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function SuccessGauge({ rate, numSimulations }: SuccessGaugeProps) {
  const pct = Math.max(0, Math.min(100, Math.round(rate * 100)));

  const zoneStroke =
    pct >= 80 ? ZONE_COLORS.green :
    pct >= 60 ? ZONE_COLORS.amber :
    ZONE_COLORS.red;

  const labelClass =
    pct >= 80 ? 'text-green-600 dark:text-green-400' :
    pct >= 60 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const qualLabel =
    pct >= 90 ? 'Excellent' :
    pct >= 80 ? 'Strong' :
    pct >= 60 ? 'Moderate' :
    'At Risk';

  return (
    <div className="card flex flex-col items-center">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Probability of Success</div>
      <div className="w-full max-w-[260px]">
        <svg
          viewBox="0 0 200 115"
          className="w-full h-auto"
          role="img"
          aria-label={`${pct}% probability of success`}
        >
          {/* Zone backgrounds */}
          <path d={arcPath(0, 60)}   stroke={ZONE_COLORS.red}   strokeOpacity={0.18} strokeWidth={STROKE} fill="none" strokeLinecap="butt" />
          <path d={arcPath(60, 80)}  stroke={ZONE_COLORS.amber} strokeOpacity={0.22} strokeWidth={STROKE} fill="none" strokeLinecap="butt" />
          <path d={arcPath(80, 100)} stroke={ZONE_COLORS.green} strokeOpacity={0.22} strokeWidth={STROKE} fill="none" strokeLinecap="butt" />

          {/* Value arc */}
          {pct > 0 && (
            <path
              d={arcPath(0, pct)}
              stroke={zoneStroke}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Big percentage in the bowl */}
          <text
            x={CX}
            y={90}
            textAnchor="middle"
            className="fill-gray-900 dark:fill-gray-100"
            style={{ fontSize: 30, fontWeight: 700 }}
          >
            {pct}%
          </text>
        </svg>
      </div>
      <div className={`text-sm font-semibold -mt-1 ${labelClass}`}>{qualLabel}</div>
      <div className="text-[11px] text-gray-400 mt-1">of {numSimulations.toLocaleString()} simulations</div>
      {pct < 80 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 text-center max-w-[260px]">
          To improve: increase savings, delay retirement, or reduce spending.
        </p>
      )}
    </div>
  );
}
