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
    <div className="border-b border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center gap-2">
        <input
          className="input-field flex-1 text-sm font-medium"
          value={scenario.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="Scenario name"
        />
        <button className="btn-primary text-xs" onClick={handleSave}>Save</button>
        <button className="btn-secondary text-xs" onClick={() => setShowList(!showList)}>
          {showList ? 'Close' : 'Load'}
        </button>
        <button className="btn-secondary text-xs" onClick={handleExport}>Export</button>
        <button className="btn-secondary text-xs" onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {showList && (
        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
          {saved.length === 0 ? (
            <p className="text-xs text-gray-400">No saved scenarios</p>
          ) : (
            saved.map(s => (
              <div key={s.id} className="flex items-center justify-between py-1 px-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                <button
                  className="text-left flex-1 hover:text-primary-600"
                  onClick={() => handleLoad(s)}
                >
                  {s.name}
                  <span className="text-gray-400 ml-2">{new Date(s.savedAt).toLocaleDateString()}</span>
                </button>
                <button
                  className="text-red-400 hover:text-red-600 ml-2"
                  onClick={() => handleDelete(s.id)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
