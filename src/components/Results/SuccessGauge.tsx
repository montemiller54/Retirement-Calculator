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
const STROKE = 18;
const NEEDLE_LENGTH = RADIUS - 4;

function valueToAngle(v: number) {
  // v: 0–100 → angle in degrees, where 0 = left (180°) and 100 = right (0°)
  return (180 - v * 1.8) * Math.PI / 180;
}

function valueToPoint(v: number, r: number = RADIUS) {
  const angle = valueToAngle(v);
  return {
    x: CX + r * Math.cos(angle),
    y: CY - r * Math.sin(angle),
  };
}

function arcPath(from: number, to: number) {
  const a = valueToPoint(from);
  const b = valueToPoint(to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${RADIUS} ${RADIUS} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function SuccessGauge({ rate, numSimulations }: SuccessGaugeProps) {
  const pct = Math.max(0, Math.min(100, Math.round(rate * 100)));

  const labelClass =
    pct >= 80 ? 'text-green-600 dark:text-green-400' :
    pct >= 60 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const qualLabel =
    pct >= 90 ? 'Excellent' :
    pct >= 80 ? 'Strong' :
    pct >= 60 ? 'Moderate' :
    'At Risk';

  // Needle geometry: a slim triangle from the hub out to the value position.
  const tip = valueToPoint(pct, NEEDLE_LENGTH);
  const baseLeft = valueToPoint(pct - 50, 7);  // 90° behind for left of base
  const baseRight = valueToPoint(pct + 50, 7); // 90° ahead for right of base
  const needlePath = `M ${baseLeft.x.toFixed(2)} ${baseLeft.y.toFixed(2)} L ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${baseRight.x.toFixed(2)} ${baseRight.y.toFixed(2)} Z`;

  return (
    <div className="card flex flex-col items-center">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Probability of Success</div>
      <div className="w-full max-w-[260px]">
        <svg
          viewBox="0 0 200 120"
          className="w-full h-auto"
          role="img"
          aria-label={`${pct}% probability of success`}
        >
          <defs>
            <linearGradient id="successGaugeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={ZONE_COLORS.red} />
              <stop offset="50%"  stopColor={ZONE_COLORS.amber} />
              <stop offset="100%" stopColor={ZONE_COLORS.green} />
            </linearGradient>
          </defs>

          {/* Full gradient arc */}
          <path
            d={arcPath(0, 100)}
            stroke="url(#successGaugeGradient)"
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
          />

          {/* Needle */}
          <path
            d={needlePath}
            className="fill-gray-900 dark:fill-gray-100"
          />
          {/* Hub */}
          <circle
            cx={CX}
            cy={CY}
            r={6}
            className="fill-gray-900 dark:fill-gray-100"
          />
          <circle
            cx={CX}
            cy={CY}
            r={2.5}
            className="fill-white dark:fill-gray-800"
          />
        </svg>
      </div>
      <div className={`text-2xl font-bold ${labelClass}`}>{pct}%</div>
      <div className={`text-sm font-semibold ${labelClass}`}>{qualLabel}</div>
      <div className="text-[0.6875rem] text-gray-400 mt-1">of {numSimulations.toLocaleString()} simulations</div>
      {pct < 80 && (
        <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400 mt-2 text-center max-w-[260px]">
          To improve: increase savings, delay retirement, or reduce spending.
        </p>
      )}
    </div>
  );
}
