import React, { useState, useRef } from 'react';
import { useScenario } from '../context/ScenarioContext';
import type { SavedScenario } from '../types';
import { loadScenarios, saveScenario, deleteScenario, exportScenario, importScenario, downloadJSON } from '../utils/storage';

export function ScenarioManager() {
  const { scenario, setField, loadScenario } = useScenario();
  const [saved, setSaved] = useState<SavedScenario[]>(() => loadScenarios());
  const [showList, setShowList] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    if (!scenario.name.trim()) return;
    saveScenario(scenario);
    setSaved(loadScenarios());
  };

  const handleLoad = (s: SavedScenario) => {
    loadScenario(s.input);
    setShowList(false);
  };

  const handleDelete = (id: string) => {
    deleteScenario(id);
    setSaved(loadScenarios());
  };

  const handleExport = () => {
    const json = exportScenario(scenario);
    downloadJSON(json, `${scenario.name.replace(/\s+/g, '-')}.json`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = importScenario(ev.target?.result as string);
        loadScenario(imported);
      } catch {
        alert('Invalid scenario file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center gap-3">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400 shrink-0">
          Plan
        </span>
        <input
          className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-primary-500 focus:outline-none focus:ring-0 px-1 py-0.5 text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors"
          value={scenario.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="Untitled plan"
          aria-label="Plan name"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button className="text-xs px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" onClick={handleSave} title="Save as new plan">Save</button>
          <button
            className={`text-xs px-2 py-1 rounded transition-colors ${
              showList
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            onClick={() => setShowList(!showList)}
            title="Show saved plans"
          >
            Load
          </button>
          <span className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />
          <button className="text-xs px-2 py-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700" onClick={handleExport} title="Export plan as JSON">Export</button>
          <button className="text-xs px-2 py-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700" onClick={() => fileInputRef.current?.click()} title="Import plan from JSON">Import</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </div>

      {showList && (
        <div className="max-w-4xl mx-auto px-6 pb-3 -mt-1">
          <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {saved.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-2">No saved plans yet. Click Save above to save the current one.</p>
            ) : (
              saved.map(s => (
                <div key={s.id} className="flex items-center justify-between py-1.5 px-3 text-xs">
                  <button
                    className="text-left flex-1 hover:text-primary-600 dark:hover:text-primary-400"
                    onClick={() => handleLoad(s)}
                  >
                    <span className="font-medium text-gray-700 dark:text-gray-200">{s.name}</span>
                    <span className="text-gray-400 ml-2">{new Date(s.savedAt).toLocaleDateString()}</span>
                  </button>
                  <button
                    className="text-gray-400 hover:text-red-500 ml-2"
                    onClick={() => handleDelete(s.id)}
                    title="Delete plan"
                    aria-label={`Delete ${s.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
