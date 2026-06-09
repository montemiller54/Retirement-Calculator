import React, { useState, useEffect, useRef } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { FILING_STATUS_LABELS, type FilingStatus } from '../../types';
import { STATE_TAX_DATA, STATE_CODES } from '../../constants/state-tax';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { Toggle } from './shared';
import { InfoTip } from './InfoTip';

interface Toast {
  message: string;
  undoJobs: { id: string; name: string; oldEndAge: number }[];
}

export function ProfileCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // Clear toast timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const handleRetirementAgeChange = (newAge: number) => {
    const oldAge = scenario.retirementAge;
    setField('retirementAge', newAge);

    // Auto-sync: update jobs whose endAge matched the old retirement age
    const jobsToSync = scenario.jobs.filter(j => j.endAge === oldAge);
    if (jobsToSync.length > 0) {
      const undoInfo = jobsToSync.map(j => ({ id: j.id, name: j.name, oldEndAge: j.endAge }));
      const updatedJobs = scenario.jobs.map(j =>
        j.endAge === oldAge ? { ...j, endAge: newAge } : j,
      );
      setField('jobs', updatedJobs);

      // Show toast
      if (toastTimer.current) clearTimeout(toastTimer.current);
      const names = jobsToSync.map(j => j.name).join(', ');
      setToast({
        message: `Updated ${names} end age to ${newAge}`,
        undoJobs: undoInfo,
      });
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    }
  };

  const handleUndo = () => {
    if (!toast) return;
    const updatedJobs = scenario.jobs.map(j => {
      const undo = toast.undoJobs.find(u => u.id === j.id);
      return undo ? { ...j, endAge: undo.oldEndAge } : j;
    });
    setField('jobs', updatedJobs);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] text-gray-400 mb-3">Your basic information and retirement timeline.</p>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="input-label">Your Age</label>
            <input
              type="number"
              className={`input-field text-center ${fieldErrorClass(ve, 'currentAge')}`}
              value={scenario.currentAge}
              min={18}
              max={99}
              onChange={e => setField('currentAge', parseInt(e.target.value) || 0)}
            />
            <FieldError errors={ve} field="currentAge" />
          </div>
          <div>
            <label className="input-label">Retire At</label>
            <input
              type="number"
              className={`input-field text-center ${fieldErrorClass(ve, 'retirementAge')}`}
              value={scenario.retirementAge}
              min={18}
              max={99}
              onChange={e => handleRetirementAgeChange(parseInt(e.target.value) || 65)}
            />
            <FieldError errors={ve} field="retirementAge" />
            {scenario.currentAge >= scenario.retirementAge && (
              <p className="text-[10px] text-green-600 dark:text-green-400 font-medium mt-0.5">Already retired</p>
            )}
          </div>
          <div>
            <label className="input-label">Plan To
            <InfoTip text="The age you want your retirement plan to last until. A common choice is 90–95 to be safe against living longer than expected." />
          </label>
            <input
              type="number"
              className={`input-field text-center ${fieldErrorClass(ve, 'endAge')}`}
              value={scenario.endAge}
              min={scenario.currentAge + 1}
              max={120}
              onChange={e => setField('endAge', parseInt(e.target.value) || 0)}
            />
            <FieldError errors={ve} field="endAge" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="input-label">State</label>
          <select
            className="input-field"
            value={scenario.stateCode ?? 'IA'}
            onChange={e => setField('stateCode', e.target.value)}
          >
            {STATE_CODES.map(code => (
              <option key={code} value={code}>{STATE_TAX_DATA[code].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="input-label">Filing Status
            <InfoTip text="Your tax filing status affects your income tax brackets. 'Married Filing Jointly' generally gives the best rates for married couples." />
          </label>
          <select
            className="input-field"
            value={scenario.filingStatus ?? 'hoh'}
            onChange={e => setField('filingStatus', e.target.value as FilingStatus)}
          >
            {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Spouse */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <Toggle
          checked={scenario.spouse?.enabled ?? false}
          onChange={v => setField('spouse.enabled', v)}
          label="Include Spouse"
        />
        {scenario.spouse?.enabled && (
          <div className="mt-3">
            <div className="w-1/4">
              <label className="input-label">Spouse Age</label>
              <input
                type="number"
                className={`input-field text-center ${fieldErrorClass(ve, 'spouse.currentAge')}`}
                value={scenario.spouse.currentAge}
                min={18}
                max={99}
                onChange={e => setField('spouse.currentAge', parseInt(e.target.value) || 0)}
              />
              <FieldError errors={ve} field="spouse.currentAge" />
            </div>
          </div>
        )}
      </div>

      {/* Toast notification for auto-synced job end age */}
      {toast && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300 animate-in fade-in">
          <span>{toast.message}</span>
          <button
            className="font-medium underline hover:text-blue-900 dark:hover:text-blue-100 shrink-0"
            onClick={handleUndo}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
