import React, { useState } from 'react';
import type { ScenarioInput, SafeSpendingResult as SafeSpendingResultType } from '../../types';
import { useSafeSpending } from '../../hooks/useSafeSpending';
import { formatCurrency } from '../../utils/format';

interface SafeSpendingSectionProps {
  scenario: ScenarioInput;
}

interface SafeSpendingDisplayProps {
  result: SafeSpendingResultType;
}

const TARGET_OPTIONS = [
  { label: 'Moderate', pct: '70%', value: 0.70 },
  { label: 'Conservative', pct: '80%', value: 0.80 },
  { label: 'Very Conservative', pct: '90%', value: 0.90 },
];

export function SafeSpendingSection({ scenario }: SafeSpendingSectionProps) {
  const [targetRate, setTargetRate] = useState(0.80);
  const { result, progress, isRunning, error, run } = useSafeSpending();

  const handleCalculate = () => {
    run(scenario, targetRate);
  };

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Safe Spending Calculator
      </h4>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        The maximum you could spend each month, in today's dollars, with the selected confidence
        level that your money lasts your entire retirement. This accounts for all income sources
        (Social Security, pension, etc.), portfolio growth, taxes, and healthcare — with spending
        held fixed (growing with inflation) and no adjustments.
      </p>
      {scenario.guardrails?.enabled && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          Note: Your simulation above uses Spending Safety Rules, which automatically reduce
          spending in downturns — boosting its success rate. This calculator assumes fixed
          spending with no adjustments, so its success rate will be lower for the same spending level.
        </p>
      )}

      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
          Confidence:
        </label>
        <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
          {TARGET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                targetRate === opt.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => setTargetRate(opt.value)}
              disabled={isRunning}
            >
              <span>{opt.label}</span>
              <span className="ml-1 opacity-70">({opt.pct})</span>
            </button>
          ))}
        </div>
        <button
          className="btn-primary text-xs px-3 py-1.5"
          onClick={handleCalculate}
          disabled={isRunning}
        >
          {isRunning ? `Calculating ${progress}%` : 'Calculate'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-500 mb-2">{error}</div>
      )}

      {isRunning && (
        <div className="mb-2">
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
            <div
              className="h-1.5 bg-primary-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {result && !isRunning && (
        <SafeSpendingDisplay result={result} />
      )}

      {!result && !isRunning && !error && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
          Select a confidence level and click Calculate.
        </p>
      )}
    </div>
  );
}

function SafeSpendingDisplay({ result }: SafeSpendingDisplayProps) {
  return (
    <div className="flex items-start gap-6">
      <div>
        <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
          {formatCurrency(result.monthlySpending)}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400"> / month</span>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
          {formatCurrency(result.annualSpending)}
          <span className="text-xs text-gray-500 dark:text-gray-400"> / year</span>
        </div>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
        <div>
          Confidence: {Math.round(result.achievedSuccessRate * 100)}% of simulations sustained this spending
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          Based on 5,000 simulations · fixed spending (no guardrails)
        </div>
      </div>
    </div>
  );
}
