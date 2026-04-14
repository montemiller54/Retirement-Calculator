import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { FILING_STATUS_LABELS, type FilingStatus } from '../../types';
import { STATE_TAX_DATA, STATE_CODES } from '../../constants/state-tax';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`relative inline-flex w-9 h-5 rounded-full border transition-colors ${checked ? 'bg-primary-500 border-primary-500' : 'bg-gray-300 border-gray-300 dark:bg-gray-500 dark:border-gray-400'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

export function ProfileCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;

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
              min={Math.max(scenario.currentAge + 1, 50)}
              max={80}
              onChange={e => setField('retirementAge', parseInt(e.target.value) || 65)}
            />
            <FieldError errors={ve} field="retirementAge" />
          </div>
          <div>
            <label className="input-label">Plan To</label>
            <input
              type="number"
              className={`input-field text-center ${fieldErrorClass(ve, 'endAge')}`}
              value={scenario.endAge}
              min={scenario.retirementAge}
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
          <label className="input-label">Filing Status</label>
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
          checked={scenario.spouse.enabled}
          onChange={v => setField('spouse.enabled', v)}
          label="Include Spouse"
        />
        {scenario.spouse.enabled && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
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
            <div>
              <label className="input-label">Spouse Retires At</label>
              <input
                type="number"
                className={`input-field text-center ${fieldErrorClass(ve, 'spouse.retirementAge')}`}
                value={scenario.spouse.retirementAge}
                min={Math.max(scenario.spouse.currentAge + 1, 50)}
                max={80}
                onChange={e => setField('spouse.retirementAge', parseInt(e.target.value) || 65)}
              />
              <FieldError errors={ve} field="spouse.retirementAge" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
