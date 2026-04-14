import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { IncomeSource } from '../../types';

export function IncomeSection() {
  const { scenario, setField } = useScenario();

  const addOtherIncome = () => {
    const src: IncomeSource = {
      id: crypto.randomUUID(),
      name: 'Other Income',
      annualAmount: 833,
      startAge: scenario.retirementAge,
      endAge: scenario.endAge,
      inflationRate: 0.02,
    };
    setField('otherIncomeSources', [...scenario.otherIncomeSources, src]);
  };

  const removeOtherIncome = (id: string) => {
    setField('otherIncomeSources', scenario.otherIncomeSources.filter(s => s.id !== id));
  };

  const updateOtherIncome = (id: string, field: keyof IncomeSource, value: unknown) => {
    setField(
      'otherIncomeSources',
      scenario.otherIncomeSources.map(s => (s.id === id ? { ...s, [field]: value } : s)),
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="section-title">Retirement Income</h3>

      {/* Social Security */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {scenario.spouse.enabled ? 'Your Social Security' : 'Social Security'}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="input-label">Monthly Benefit ($)</label>
            <input
              type="number"
              className="input-field"
              value={scenario.socialSecurityBenefit}
              onChange={e => setField('socialSecurityBenefit', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="input-label">Claim Age</label>
            <input
              type="number"
              className="input-field"
              value={scenario.socialSecurityClaimAge}
              min={62}
              max={70}
              onChange={e => setField('socialSecurityClaimAge', parseInt(e.target.value) || 67)}
            />
          </div>
        </div>
        <div>
          <label className="input-label">COLA (%)</label>
          <input
            type="number"
            className="input-field w-20"
            step="0.1"
            value={(scenario.socialSecurityCOLA * 100).toFixed(1)}
            onChange={e => setField('socialSecurityCOLA', (parseFloat(e.target.value) || 0) / 100)}
          />
        </div>
      </div>

      {scenario.spouse.enabled && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Spouse Social Security</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="input-label">Monthly Benefit ($)</label>
              <input
                type="number"
                className="input-field"
                value={scenario.spouse.socialSecurityBenefit}
                onChange={e => setField('spouse.socialSecurityBenefit', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="input-label">Claim Age</label>
              <input
                type="number"
                className="input-field"
                value={scenario.spouse.socialSecurityClaimAge}
                min={62}
                max={70}
                onChange={e => setField('spouse.socialSecurityClaimAge', parseInt(e.target.value) || 67)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pension */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {scenario.spouse.enabled ? 'Your Pension' : 'Pension'}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="input-label">Monthly Amount ($)</label>
            <input
              type="number"
              className="input-field"
              value={scenario.pensionAmount}
              onChange={e => setField('pensionAmount', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="input-label">Start Age</label>
            <input
              type="number"
              className="input-field"
              value={scenario.pensionStartAge}
              onChange={e => setField('pensionStartAge', parseInt(e.target.value) || 65)}
            />
          </div>
        </div>
        <div>
          <label className="input-label">COLA (%)</label>
          <input
            type="number"
            className="input-field w-20"
            step="0.1"
            value={(scenario.pensionCOLA * 100).toFixed(1)}
            onChange={e => setField('pensionCOLA', (parseFloat(e.target.value) || 0) / 100)}
          />
        </div>
      </div>

      {scenario.spouse.enabled && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Spouse Pension</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="input-label">Monthly Amount ($)</label>
              <input
                type="number"
                className="input-field"
                value={scenario.spouse.pensionAmount}
                onChange={e => setField('spouse.pensionAmount', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="input-label">Start Age</label>
              <input
                type="number"
                className="input-field"
                value={scenario.spouse.pensionStartAge}
                onChange={e => setField('spouse.pensionStartAge', parseInt(e.target.value) || 65)}
              />
            </div>
          </div>
          <div>
            <label className="input-label">COLA (%)</label>
            <input
              type="number"
              className="input-field w-20"
              step="0.1"
              value={(scenario.spouse.pensionCOLA * 100).toFixed(1)}
              onChange={e => setField('spouse.pensionCOLA', (parseFloat(e.target.value) || 0) / 100)}
            />
          </div>
        </div>
      )}

      {/* Other Income */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Other Income</label>
          <button
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            onClick={addOtherIncome}
          >
            + Add
          </button>
        </div>
        {scenario.otherIncomeSources.map(src => (
          <div key={src.id} className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs space-y-1">
            <div className="flex gap-1">
              <input
                className="input-field flex-1"
                value={src.name}
                onChange={e => updateOtherIncome(src.id, 'name', e.target.value)}
              />
              <button
                className="text-red-400 hover:text-red-600 px-1"
                onClick={() => removeOtherIncome(src.id)}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <div>
                <label className="input-label">$/mo</label>
                <input
                  type="number"
                  className="input-field"
                  value={src.annualAmount}
                  onChange={e => updateOtherIncome(src.id, 'annualAmount', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="input-label">Start</label>
                <input
                  type="number"
                  className="input-field"
                  value={src.startAge}
                  onChange={e => updateOtherIncome(src.id, 'startAge', parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="input-label">End</label>
                <input
                  type="number"
                  className="input-field"
                  value={src.endAge}
                  onChange={e => updateOtherIncome(src.id, 'endAge', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
