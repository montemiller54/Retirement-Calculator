import React, { useState, useRef, useEffect } from 'react';
import { useScenario } from '../context/ScenarioContext';
import type { SavedScenario } from '../types';
import {
  loadScenarios, saveScenario, deleteScenario,
  exportScenario, importScenario, downloadJSON,
} from '../utils/storage';

export function ScenarioManager() {
  const { scenario, setField, loadScenario, activePlanId, setActivePlanId, saveStatus } = useScenario();
  const [saved, setSaved] = useState<SavedScenario[]>(() => loadScenarios());
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const refreshSaved = () => setSaved(loadScenarios());

  const handleSaveAsNew = () => {
    const existingNames = new Set(saved.map(s => s.name));
    let name = scenario.name?.trim() || 'Untitled plan';
    if (existingNames.has(name)) {
      let n = 2;
      while (existingNames.has(`${name} (${n})`)) n++;
      name = `${name} (${n})`;
    }
    const updated = { ...scenario, name };
    const newSaved = saveScenario(updated);
    setField('name', name);
    setActivePlanId(newSaved.id);
    refreshSaved();
    setOpen(false);
  };

  const handleLoad = (s: SavedScenario) => {
    loadScenario(s.input, s.id);
    setOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteScenario(id);
    if (activePlanId === id) setActivePlanId(null);
    refreshSaved();
  };

  const handleExport = () => {
    const json = exportScenario(scenario);
    downloadJSON(json, `${(scenario.name || 'plan').replace(/\s+/g, '-')}.json`);
    setOpen(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = importScenario(ev.target?.result as string);
        // Imported plan becomes active in-memory but isn't auto-bookmarked
        loadScenario(imported, null);
        setOpen(false);
      } catch {
        alert('Invalid plan file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="scenario-pill flex items-center gap-2 px-3 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <span className="text-xs font-bold tracking-wider uppercase text-gray-400 dark:text-gray-500 shrink-0">
          Plan
        </span>

        <input
          className="bg-transparent border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-primary-500 focus:outline-none focus:ring-0 px-1 py-0.5 text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors"
          value={scenario.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="Untitled plan"
          aria-label="Plan name"
          style={{ width: `${Math.max((scenario.name || '').length, 4) + 1}ch` }}
        />

        <div className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={`inline-flex items-center justify-center w-7 h-7 rounded text-gray-500 dark:text-gray-400 transition-colors ${
              open ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="Plan options"
            aria-label="Plan options"
          >
            <Chevron open={open} />
          </button>

          {open && (
            <div
              ref={popoverRef}
              role="menu"
              className="absolute z-30 right-0 top-full mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
            >
              <div className="py-1">
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleSaveAsNew}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <PlusIcon className="w-4 h-4" />
                  Save as new plan
                </button>
              </div>

              {saved.length > 0 && (
                <>
                  <div className="border-t border-gray-100 dark:border-gray-800" />
                  <div className="py-1 max-h-64 overflow-y-auto">
                    <div className="px-3 py-1 text-[0.625rem] font-semibold tracking-wider uppercase text-gray-400 dark:text-gray-500">
                      Saved plans
                    </div>
                    {saved.map(s => {
                      const isActive = s.id === activePlanId;
                      return (
                        <div
                          key={s.id}
                          className={`group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${
                            isActive
                              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                          onClick={() => handleLoad(s)}
                          role="menuitem"
                        >
                          <span className="w-2 flex-shrink-0">
                            {isActive && <span className="block w-1.5 h-1.5 rounded-full bg-primary-500" />}
                          </span>
                          <span className="flex-1 truncate font-medium">{s.name}</span>
                          <span className="text-[0.625rem] text-gray-400">
                            {new Date(s.savedAt).toLocaleDateString()}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, s.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 px-1"
                            title="Delete plan"
                            aria-label={`Delete ${s.name}`}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="border-t border-gray-100 dark:border-gray-800" />
              <div className="py-1">
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleExport}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Export plan as JSON
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Import plan from JSON…
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SavedIndicator status={saveStatus} hasActivePlan={!!activePlanId} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />
    </div>
  );
}

function SavedIndicator({ status, hasActivePlan }: { status: 'idle' | 'saved'; hasActivePlan: boolean }) {
  return (
    <span
      className={`shrink-0 text-[0.6875rem] tabular-nums transition-opacity duration-500 ${
        status === 'saved' ? 'opacity-100 text-green-600 dark:text-green-400' : 'opacity-0'
      }`}
      aria-live="polite"
    >
      {hasActivePlan ? 'Saved' : 'Saved locally'}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

