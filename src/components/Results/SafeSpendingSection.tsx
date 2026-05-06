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
  { label: '80%', value: 0.80 },
  { label: '85%', value: 0.85 },
  { label: '90%', value: 0.90 },
  { label: '95%', value: 0.95 },
];

export function SafeSpendingSection({ scenario }: SafeSpendingSectionProps) {
  const [targetRate, setTargetRate] = useState(0.90);
  const { result, progress, isRunning, error, run } = useSafeSpending();

  const handleCalculate = () => {
    run(scenario, targetRate);
  };

  return (
    <div className="card">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
        Safe Spending Calculator
      </h4>

      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
          Target success rate:
        </label>
        <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
          {TARGET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                targetRate === opt.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => setTargetRate(opt.value)}
              disabled={isRunning}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          className="btn-primary text-xs px-3 py-1"
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
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Click Calculate to find the maximum monthly spending that achieves your target success rate,
          taking all income sources and portfolio growth into account.
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
          Target: {Math.round(result.targetSuccessRate * 100)}% success
        </div>
        <div>
          Achieved: {Math.round(result.achievedSuccessRate * 100)}% success
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          Based on 5,000 simulations · no guardrails
        </div>
      </div>
    </div>
  );
}
