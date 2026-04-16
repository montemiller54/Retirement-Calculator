import React from 'react';
import type { SimulationResult } from '../../types';
import type { ValidationError } from '../../utils/validation';
import { SuccessGauge } from './SuccessGauge';
import { FanChart } from './FanChart';
import { AccountDrawdownChart } from './AccountDrawdownChart';
import { CashflowChart } from './CashflowChart';
import { TaxChart } from './TaxChart';
import { TrajectoryTable } from './TrajectoryTable';
import { WorstCaseSummary } from './WorstCaseSummary';

interface ResultsPanelProps {
  result: SimulationResult | null;
  retirementAge: number;
  isRunning: boolean;
  progress: number;
  error: string | null;
  validationErrors: ValidationError[];
}

export function ResultsPanel({ result, retirementAge, isRunning, progress, error, validationErrors }: ResultsPanelProps) {
  if (validationErrors.length > 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="card max-w-lg w-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-500 text-xl">⚠</span>
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
              Please fix the following before running
            </h3>
          </div>
          <ul className="space-y-2">
            {validationErrors.map((err, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="text-red-400 mt-0.5">•</span>
                <span className="text-gray-700 dark:text-gray-300">{err.message}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card text-center max-w-sm">
          <div className="text-red-500 text-lg mb-2">Error</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card text-center">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Running simulations...
          </div>
          <div className="w-48 h-2 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto">
            <div
              className="h-2 bg-primary-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">{progress}%</div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <div className="text-sm">Configure your scenario and click</div>
          <div className="text-sm font-medium">Run Simulation</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SuccessGauge rate={result.successRate} numSimulations={result.endingBalances.length} />
        <WorstCaseSummary depletionAges={result.depletionAges} successRate={result.successRate} />
      </div>

      <FanChart data={result.percentileBands} retirementAge={retirementAge} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CashflowChart data={result.averagePath} retirementAge={retirementAge} />
        <TaxChart data={result.medianPath} />
      </div>

      <AccountDrawdownChart data={result.averagePath} retirementAge={retirementAge} />

      <TrajectoryTable data={result.medianPath} />
    </div>
  );
}
