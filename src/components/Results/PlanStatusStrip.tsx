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

  const headlinePhrase = headline(result, scenario);

  return (
    <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <div className={`flex items-center gap-3 min-w-0 ${dirty ? 'opacity-60' : ''}`}>
          <MiniDial pct={pct} dim={dirty} />
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

// Mirror of the large SuccessGauge — same red→amber→green gradient arc with a
// needle pointing at the value. Sized for the header strip.
function MiniDial({ pct, dim }: { pct: number; dim?: boolean }) {
  const CX = 50;
  const CY = 50;
  const R = 38;
  const STROKE = 9;
  const NEEDLE_LEN = R - 2;
  const v = Math.max(0, Math.min(100, pct));

  const angleAt = (val: number) => (180 - val * 1.8) * Math.PI / 180;
  const pointAt = (val: number, r: number) => ({
    x: CX + r * Math.cos(angleAt(val)),
    y: CY - r * Math.sin(angleAt(val)),
  });
  const arc = (from: number, to: number) => {
    const a = pointAt(from, R);
    const b = pointAt(to, R);
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  };
  const tip = pointAt(v, NEEDLE_LEN);
  const baseL = pointAt(v - 50, 4);
  const baseR = pointAt(v + 50, 4);
  const needle = `M ${baseL.x.toFixed(2)} ${baseL.y.toFixed(2)} L ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${baseR.x.toFixed(2)} ${baseR.y.toFixed(2)} Z`;

  return (
    <svg
      viewBox="0 0 100 58"
      className={`shrink-0 w-9 h-auto ${dim ? 'opacity-60' : ''}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="miniDialGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <path d={arc(0, 100)} stroke="url(#miniDialGradient)" strokeWidth={STROKE} fill="none" strokeLinecap="round" />
      <path d={needle} className="fill-gray-900 dark:fill-gray-100" />
      <circle cx={CX} cy={CY} r={3} className="fill-gray-900 dark:fill-gray-100" />
    </svg>
  );
}
