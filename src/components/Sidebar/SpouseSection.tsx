import React from 'react';
import { useScenario } from '../../context/ScenarioContext';

export function SpouseSection() {
  const { scenario, setField } = useScenario();
  const sp = scenario.spouse;

  return (
    <div className="space-y-3">
      <h3 className="section-title flex items-center gap-2">
        Spouse
        <label className="flex items-center gap-1 text-xs font-normal">
          <input
            type="checkbox"
            checked={sp.enabled}
            onChange={e => setField('spouse.enabled', e.target.checked)}
            className="accent-primary-600"
          />
          Enable
        </label>
      </h3>

      {sp.enabled && (
        <div className="space-y-3">
          {/* Age & Retirement */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="input-label">Current Age</label>
              <input
                type="number"
                className="input-field"
                value={sp.currentAge}
                min={18}
                max={99}
                onChange={e => setField('spouse.currentAge', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="input-label">Retirement Age</label>
              <input
                type="number"
                className="input-field"
                value={sp.retirementAge}
                min={Math.max(sp.currentAge + 1, 50)}
                max={80}
                onChange={e => setField('spouse.retirementAge', parseInt(e.target.value) || 65)}
              />
            </div>
          </div>

          {/* Earnings */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Earnings</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="input-label">Monthly Salary ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={sp.currentSalary}
                  onChange={e => setField('spouse.currentSalary', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="input-label">Growth (%)</label>
                <input
                  type="number"
                  className="input-field"
                  step="0.1"
                  value={(sp.salaryGrowthRate * 100).toFixed(1)}
                  onChange={e => setField('spouse.salaryGrowthRate', (parseFloat(e.target.value) || 0) / 100)}
                />
              </div>
            </div>
          </div>

          {/* Social Security */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Social Security</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="input-label">Monthly Benefit ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={sp.socialSecurityBenefit}
                  onChange={e => setField('spouse.socialSecurityBenefit', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="input-label">Claim Age</label>
                <input
                  type="number"
                  className="input-field"
                  value={sp.socialSecurityClaimAge}
                  min={62}
                  max={70}
                  onChange={e => setField('spouse.socialSecurityClaimAge', parseInt(e.target.value) || 67)}
                />
              </div>
            </div>
          </div>

          {/* Pension */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Pension</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="input-label">Monthly Amount ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={sp.pensionAmount}
                  onChange={e => setField('spouse.pensionAmount', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="input-label">Start Age</label>
                <input
                  type="number"
                  className="input-field"
                  value={sp.pensionStartAge}
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
                value={(sp.pensionCOLA * 100).toFixed(1)}
                onChange={e => setField('spouse.pensionCOLA', (parseFloat(e.target.value) || 0) / 100)}
              />
            </div>
          </div>

          <p className="text-[10px] text-gray-400">
            Spouse income is combined with yours for taxes (MFJ). Savings go to the shared portfolio.
            COLA uses the same rate as your Social Security.
          </p>
        </div>
      )}
    </div>
  );
}
