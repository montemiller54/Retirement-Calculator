import React, { useState } from 'react';
import { ScenarioProvider, useScenario } from './context/ScenarioContext';
import { ResultsPanel } from './components/Results';
import { ScenarioManager } from './components/ScenarioManager';
import { AssumptionsPage } from './components/AssumptionsPage';
import { LeftRail } from './components/LeftRail';
import { ProfileCanvas } from './components/ProfileCanvas';
import { useSimulation } from './hooks/useSimulation';
import { useTheme } from './hooks/useTheme';
import { validateScenario } from './utils/validation';
import type { AppView } from './navigation';

function AppInner() {
  const { scenario } = useScenario();
  const { result, progress, isRunning, error, run } = useSimulation();
  const { dark, toggleDark } = useTheme();
  const [view, setView] = useState<AppView>({ kind: 'profile', sectionId: 'profile' });

  const validationErrors = validateScenario(scenario);

  const handleRun = () => {
    if (validationErrors.length > 0) return;
    run(scenario, { numSimulations: 5000 });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center px-5 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-4 shrink-0">
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
        <div className="flex-1 flex items-center justify-center">
          <ScenarioManager />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="text-sm p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
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
        <LeftRail
          view={view}
          setView={setView}
          validationErrors={validationErrors}
          onRun={handleRun}
          isRunning={isRunning}
          progress={progress}
          hasResults={result !== null}
        />

        <main className="flex-1 bg-gray-50 dark:bg-gray-950 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {view.kind === 'profile' && (
              <ProfileCanvas
                sectionId={view.sectionId}
                validationErrors={validationErrors}
                setView={setView}
                onRun={handleRun}
                isRunning={isRunning}
              />
            )}
            {view.kind === 'results' && (
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
            )}
            {view.kind === 'methodology' && (
              <div className="h-full overflow-y-auto">
                <AssumptionsPage />
              </div>
            )}
          </div>
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
