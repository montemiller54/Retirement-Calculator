import { useState, useEffect, useRef } from 'react';
import { ScenarioProvider, useScenario } from './context/ScenarioContext';
import { ResultsPanel } from './components/Results';
import { PlanStatusStrip } from './components/Results/PlanStatusStrip';
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
  const { result, progress, isRunning, error, lastRunScenario, lastRunAt, run } = useSimulation();
  const { dark, toggleDark } = useTheme();
  const [view, setView] = useState<AppView>({ kind: 'profile', sectionId: 'profile' });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const validationErrors = validateScenario(scenario);

  // Auto-navigate to results when simulation completes
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !isRunning && result) {
      setView({ kind: 'results', sectionId: 'plan' });
    }
    wasRunning.current = isRunning;
  }, [isRunning, result]);

  const handleRun = () => {
    if (validationErrors.length > 0) return;
    run(scenario, { numSimulations: 5000 });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center px-5 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-2 -ml-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Open navigation"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
          <a href="/" className="flex items-center gap-2 group">
            <img src="/two-trees.svg" alt="" className="w-6 h-6" />
            <span className="text-[0.9375rem] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Two Trees Planner
            </span>
          </a>
          <PrivacyBadge />
        </div>
        <div className="hidden md:flex flex-1 items-center justify-center min-w-0 mx-2">
          <ScenarioManager />
        </div>
        <div className="md:hidden flex-1" />
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="text-sm p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            onClick={() => setView({ kind: 'methodology' })}
            title="How this works"
            aria-label="How this works"
          >
            <QuestionMarkIcon className="w-4 h-4" />
          </button>
          <button
            className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
              dark
                ? 'bg-gray-300 text-gray-800 hover:bg-gray-200'
                : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
            }`}
            onClick={toggleDark}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {dark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </header>

      {/* Mobile-only scenario row */}
      <div className="md:hidden flex items-center justify-center px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <ScenarioManager />
      </div>

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
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <main className="flex-1 bg-gray-50 dark:bg-gray-950 flex flex-col overflow-hidden">
          {result && view.kind !== 'methodology' && (
            <PlanStatusStrip
              result={result}
              scenario={scenario}
              lastRunScenario={lastRunScenario}
              lastRunAt={lastRunAt}
              isRunning={isRunning}
              onRun={handleRun}
              canRun={validationErrors.length === 0}
            />
          )}
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
                activeTab={view.sectionId}
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

function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function QuestionMarkIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.7.5-1.5 1-1.5 2v.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PrivacyBadge() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative hidden sm:inline-flex" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${
          open
            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        <LockIcon className="w-3 h-3" />
        100% private
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Privacy details"
          className="absolute z-30 left-0 top-full mt-2 w-72 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-4 text-[0.75rem] leading-relaxed text-gray-700 dark:text-gray-200"
        >
          <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Your data stays on this device</div>
          <ul className="space-y-1.5 list-disc pl-4 marker:text-gray-400">
            <li>Plans are saved in your browser's <span className="font-medium">localStorage</span>, never sent to a server.</li>
            <li>No account, no login, no cookies, no tracking.</li>
            <li>Clearing your browser data will erase your saved plans.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
