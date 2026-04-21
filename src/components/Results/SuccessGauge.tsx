import React from 'react';

interface SuccessGaugeProps {
  rate: number; // 0-1
  numSimulations: number;
}

export function SuccessGauge({ rate, numSimulations }: SuccessGaugeProps) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80 ? 'text-green-600 dark:text-green-400' :
    pct >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
    'text-red-600 dark:text-red-400';

  const bgColor =
    pct >= 80 ? 'bg-green-500' :
    pct >= 60 ? 'bg-yellow-500' :
    'bg-red-500';

  const qualLabel =
    pct >= 90 ? 'Excellent' :
    pct >= 80 ? 'Strong' :
    pct >= 60 ? 'Moderate' :
    'At Risk';

  return (
    <div className="card text-center">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Probability of Success</div>
      <div className={`text-4xl font-bold ${color}`}>{pct}%</div>
      <div className={`text-sm font-semibold mt-0.5 ${color}`}>{qualLabel}</div>
      <div className="text-xs text-gray-400 mt-1">of {numSimulations.toLocaleString()} simulations</div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${bgColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        In {pct}% of {numSimulations.toLocaleString()} simulated market scenarios, your money lasted through retirement.
      </p>
      {pct < 80 && (
        <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-1">
          To improve: consider increasing savings, delaying retirement, or reducing spending.
        </p>
      )}
    </div>
  );
}
