import React from 'react';
import type { SimulationResult, ScenarioInput } from '../../types';
import type { ValidationError } from '../../utils/validation';
import type { ResultsSectionId } from '../../navigation';
import { RESULTS_SECTIONS } from '../../navigation';
import { SuccessGauge } from './SuccessGauge';
import { FanChart } from './FanChart';
import { PlanJourneyChart } from './PlanJourneyChart';
import { AccountDrawdownChart } from './AccountDrawdownChart';
import { CashflowChart } from './CashflowChart';
import { TaxChart } from './TaxChart';
import { SafeSpendingSection } from './SafeSpendingSection';
import { WorstCaseSummary } from './WorstCaseSummary';
import { TrajectoryTable } from './TrajectoryTable';
import { PlanStatusStrip } from './PlanStatusStrip';
import { NextStepCards } from './NextStepCards';

interface ResultsPanelProps {
  result: SimulationResult | null;
  scenario: ScenarioInput;
  retirementAge: number;
  currentAge: number;
  isRunning: boolean;
  progress: number;
  error: string | null;
  validationErrors: ValidationError[];
  activeTab: ResultsSectionId;
  setActiveTab: (id: ResultsSectionId) => void;
  lastRunScenario: ScenarioInput | null;
  lastRunAt: number | null;
  onRun: () => void;
}

export function ResultsPanel({
  result, scenario, retirementAge, currentAge, isRunning, progress, error, validationErrors,
  activeTab, setActiveTab, lastRunScenario, lastRunAt, onRun,
}: ResultsPanelProps) {
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

  if (isRunning && !result) {
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
        <div className="text-center text-gray-400 dark:text-gray-500">
          <svg viewBox="0 0 24 24" className="w-10 h-10 mx-auto mb-3 text-primary-500/70" aria-hidden="true">
            <path d="M3 18 Q 12 14 21 6" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
            <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
          </svg>
          <div className="text-sm">Configure your scenario and click</div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">Run Simulation</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <PlanStatusStrip
        result={result}
        scenario={scenario}
        lastRunScenario={lastRunScenario}
        lastRunAt={lastRunAt}
        isRunning={isRunning}
        onRun={onRun}
        canRun={validationErrors.length === 0}
      />

      <div className="sticky top-[49px] z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-1 px-4 overflow-x-auto">
          {RESULTS_SECTIONS.map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={
                  active
                    ? 'relative px-3 py-2.5 text-sm font-medium text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 -mb-px'
                    : 'relative px-3 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-b-2 border-transparent -mb-px'
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {activeTab === 'plan' && (
          <>
            <PlanJourneyChart
              data={result.medianPath}
              scenario={scenario}
              retirementAge={retirementAge}
              currentAge={currentAge}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <SuccessGauge rate={result.successRate} numSimulations={result.endingBalances.length} />
              <NextStepCards setActiveTab={setActiveTab} />
            </div>
          </>
        )}

        {activeTab === 'outcomes' && (
          <>
            <FanChart
              data={result.percentileBands}
              retirementAge={retirementAge}
              currentAge={currentAge}
            />
            <WorstCaseSummary
              depletionAges={result.depletionAges}
              successRate={result.successRate}
            />
            <SafeSpendingSection scenario={scenario} />
          </>
        )}

        {activeTab === 'cashflow' && (
          <CashflowChart
            data={result.expectedPath}
            retirementAge={retirementAge}
            currentAge={currentAge}
          />
        )}

        {activeTab === 'taxes' && (
          <TaxChart data={result.expectedPath} currentAge={currentAge} />
        )}

        {activeTab === 'accounts' && (
          <>
            <AccountDrawdownChart
              data={result.medianPath}
              retirementAge={retirementAge}
              currentAge={currentAge}
            />
            <TrajectoryTable data={result.medianPath} />
          </>
        )}

        <p className="text-[11px] text-gray-500 dark:text-gray-400 px-1">
          Charts labeled <span className="font-medium">Simulated</span> come from 5,000 Monte Carlo runs with real market volatility. Charts labeled <span className="font-medium">Average</span> use a smooth average-return projection.
        </p>
      </div>
    </div>
  );
}
