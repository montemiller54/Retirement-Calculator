import React, { useState } from 'react';
import { ScenarioProvider, useScenario } from './context/ScenarioContext';
import { Sidebar } from './components/Sidebar';
import { ResultsPanel } from './components/Results';
import { ScenarioManager } from './components/ScenarioManager';
import { AssumptionsPage } from './components/AssumptionsPage';
import { useSimulation } from './hooks/useSimulation';
import { useTheme } from './hooks/useTheme';
import { validateScenario, type ValidationError } from './utils/validation';

type Tab = 'results' | 'assumptions';

function AppInner() {
  const { scenario } = useScenario();
  const { result, progress, isRunning, error, run } = useSimulation();
  const { dark, toggleDark } = useTheme();
  const [tab, setTab] = useState<Tab>('results');
  const [seed, setSeed] = useState<string>('');

  const validationErrors = validateScenario(scenario);

  const handleRun = () => {
    if (validationErrors.length > 0) return;
    run(scenario, {
      numSimulations: 1000,
      seed: seed ? parseInt(seed) : undefined,
    });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">📊 Retirement Planner</h1>
          <span className="text-[10px] text-gray-400 hidden sm:inline" title="All data is stored in your browser's localStorage. Nothing is sent to any server.">
            🔒 100% private — your data never leaves your browser
          </span>
          <div className="flex gap-1">
            <button
              className={`text-xs px-2 py-1 rounded ${tab === 'results' ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setTab('results')}
            >
              Results
            </button>
            <button
              className={`text-xs px-2 py-1 rounded ${tab === 'assumptions' ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setTab('assumptions')}
            >
              Assumptions
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-400">Seed:</label>
            <input
              type="number"
              className="input-field w-20 text-xs"
              placeholder="Random"
              value={seed}
              onChange={e => setSeed(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            onClick={handleRun}
            disabled={isRunning || validationErrors.length > 0}
          >
            {isRunning ? `Running ${progress}%` : 'Run Simulation'}
          </button>
          <button
            className="text-sm p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={toggleDark}
            title="Toggle theme"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-96 xl:w-[460px] shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
          <ScenarioManager />
          <Sidebar validationErrors={validationErrors} />
        </aside>

        {/* Main area */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-950 overflow-hidden">
          {tab === 'results' ? (
            <ResultsPanel
              result={result}
              retirementAge={scenario.retirementAge}
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
