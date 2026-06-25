import React, { useState } from 'react';
import { ScenarioProvider, useScenario } from './context/ScenarioContext';
import { Sidebar } from './components/Sidebar';
import { ResultsPanel } from './components/Results';
import { ScenarioManager } from './components/ScenarioManager';
import { AssumptionsPage } from './components/AssumptionsPage';
import { useSimulation } from './hooks/useSimulation';
import { useTheme } from './hooks/useTheme';
import { validateScenario, type ValidationError } from './utils/validation';

type Tab = 'results' | 'methodology';

function AppInner() {
  const { scenario } = useScenario();
  const { result, progress, isRunning, error, run } = useSimulation();
  const { dark, toggleDark } = useTheme();
  const [tab, setTab] = useState<Tab>('results');

  const validationErrors = validateScenario(scenario);

  const handleRun = () => {
    if (validationErrors.length > 0) return;
    run(scenario, {
      numSimulations: 5000,
    });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 group">
            <PlainsightMark className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Plainsight
            </span>
          </a>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300"
                title="All data is stored in your browser's localStorage. Nothing is sent to any server.">
            <LockIcon className="w-3 h-3" />
            100% private
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`text-xs px-3 py-1.5 border-b-2 -mb-[10px] transition-colors ${
              tab === 'results'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-medium'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            onClick={() => setTab('results')}
          >
            Results
          </button>
          <button
            className={`text-xs px-3 py-1.5 border-b-2 -mb-[10px] transition-colors ${
              tab === 'methodology'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-medium'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            onClick={() => setTab('methodology')}
          >
            Methodology
          </button>
          <button
            className="ml-3 text-sm p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            onClick={toggleDark}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: title strip + card content */}
        <aside className="w-[520px] xl:w-[580px] shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
          <ScenarioManager />
          <Sidebar
            validationErrors={validationErrors}
            onRun={handleRun}
            isRunning={isRunning}
            progress={progress}
          />
        </aside>

        {/* Main area */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-950 overflow-hidden">
          {tab === 'results' ? (
            <ResultsPanel
              result={result}
              scenario={scenario}
              retirementAge={scenario.retirementAge}
              currentAge={scenario.currentAge}
              isRunning={isRunning}
              progress={progress}
              error={error}
              validationErrors={validationErrors}
            />
          ) : (
            <div className="h-full overflow-y-auto">
              <AssumptionsPage />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ScenarioProvider>
      <AppInner />
    </ScenarioProvider>
  );
}

// Plainsight mark: a horizon baseline and an ascending median line — the
// two shapes our fan chart actually shows.
function PlainsightMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 18 Q 12 14 21 6" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
