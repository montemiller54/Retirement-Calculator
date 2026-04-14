import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { FILING_STATUS_LABELS, type FilingStatus } from '../../types';
import { STATE_TAX_DATA, STATE_CODES } from '../../constants/state-tax';

export function ProfileSection() {
  const { scenario, setField } = useScenario();

  return (
    <div className="space-y-3">
      <h3 className="section-title">Profile & Timeline</h3>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="input-label">Current Age</label>
          <input
            type="number"
            className="input-field"
            value={scenario.currentAge}
            min={18}
            max={99}
            onChange={e => setField('currentAge', parseInt(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="input-label">Plan Through Age</label>
          <input
            type="number"
            className="input-field"
            value={scenario.endAge}
            min={scenario.retirementAge}
            max={120}
            onChange={e => setField('endAge', parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      <div>
        <label className="input-label">
          Retirement Age: <span className="font-bold text-primary-600 dark:text-primary-400">{scenario.retirementAge}</span>
        </label>
        <input
          type="range"
          className="w-full accent-primary-600"
          value={scenario.retirementAge}
          min={Math.max(scenario.currentAge + 1, 50)}
          max={80}
          onChange={e => setField('retirementAge', parseInt(e.target.value))}
        />
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>{Math.max(scenario.currentAge + 1, 50)}</span>
          <span>80</span>
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
              <option key={code} value={code}>{STATE_TAX_DATA[code].label} ({code})</option>
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
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={scenario.spouse.enabled}
            onChange={e => setField('spouse.enabled', e.target.checked)}
            className="accent-primary-600"
          />
          Include Spouse
        </label>

        {scenario.spouse.enabled && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="input-label">Spouse Age</label>
              <input
                type="number"
                className="input-field"
                value={scenario.spouse.currentAge}
                min={18}
                max={99}
                onChange={e => setField('spouse.currentAge', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="input-label">Spouse Retirement Age</label>
              <input
                type="number"
                className="input-field"
                value={scenario.spouse.retirementAge}
                min={Math.max(scenario.spouse.currentAge + 1, 50)}
                max={80}
                onChange={e => setField('spouse.retirementAge', parseInt(e.target.value) || 65)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
