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

  return (
    <div className="card text-center">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Probability of Success</div>
      <div className={`text-4xl font-bold ${color}`}>{pct}%</div>
      <div className="text-xs text-gray-400 mt-1">of {numSimulations.toLocaleString()} simulations</div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${bgColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
