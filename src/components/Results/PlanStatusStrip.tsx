import React from 'react';
import type { ScenarioInput, SimulationResult } from '../../types';

interface PlanStatusStripProps {
  result: SimulationResult;
  scenario: ScenarioInput;
  lastRunScenario: ScenarioInput | null;
  lastRunAt: number | null;
  isRunning: boolean;
  onRun: () => void;
  canRun: boolean;
}

export function PlanStatusStrip({
  result, scenario, lastRunScenario, lastRunAt, isRunning, onRun, canRun,
}: PlanStatusStripProps) {
  const pct = Math.round(result.successRate * 100);
  const dirty = isDirty(scenario, lastRunScenario);

  const dotColor = dirty
    ? 'bg-gray-400 dark:bg-gray-500'
    : pct >= 80 ? 'bg-green-500'
    : pct >= 60 ? 'bg-amber-500'
    : 'bg-red-500';

  const headlinePhrase = headline(result, scenario);

  return (
    <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <div className={`flex items-center gap-3 min-w-0 ${dirty ? 'opacity-60' : ''}`}>
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`}
            aria-hidden="true"
          />
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {pct}%
            </span>
            <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              success
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              · {headlinePhrase}
            </span>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 shrink-0">
          {dirty ? (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Inputs changed — re-run
            </span>
          ) : lastRunAt !== null ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {timeAgo(lastRunAt)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning || !canRun}
            className={
              dirty
                ? 'px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                : 'px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            }
          >
            {isRunning ? 'Running…' : 'Re-run'}
          </button>
        </div>
      </div>
    </div>
  );
}

function isDirty(current: ScenarioInput, snapshot: ScenarioInput | null): boolean {
  if (!snapshot) return false;
  return JSON.stringify(current) !== JSON.stringify(snapshot);
}

function headline(result: SimulationResult, scenario: ScenarioInput): string {
  const pct = Math.round(result.successRate * 100);
  const failurePct = 100 - pct;
  const depletions = result.depletionAges.filter((a): a is number => a !== null);
  if (depletions.length === 0) {
    return `Plan lasts through age ${scenario.endAge} in every simulation`;
  }
  if (pct >= 95) {
    return `Plan lasts through age ${scenario.endAge}`;
  }
  return `Fails in ${failurePct}% of runs`;
}

function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 30) return 'Last run just now';
  if (seconds < 60) return `Last run ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Last run ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last run ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `Last run ${days} d ago`;
}
