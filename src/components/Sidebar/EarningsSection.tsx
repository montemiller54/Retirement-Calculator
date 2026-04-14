import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { ACCOUNT_LABELS, type AccountType } from '../../types';

const ALLOCATION_ACCOUNTS: AccountType[] = [
  'traditional401k', 'roth401k', 'traditionalIRA', 'rothIRA', 'taxable', 'hsa', 'cashAccount', 'otherAssets',
];

export function EarningsSection() {
  const { scenario, setField } = useScenario();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const allocSum = ALLOCATION_ACCOUNTS.reduce(
    (s, a) => s + (scenario.contributionAllocation[a] || 0), 0
  );

  return (
    <div className="space-y-3">
      <h3 className="section-title">Earnings & Savings</h3>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="input-label">{scenario.spouse.enabled ? 'Your Monthly Salary ($)' : 'Monthly Salary ($)'}</label>
          <input
            type="number"
            className="input-field"
            value={scenario.currentSalary}
            onChange={e => setField('currentSalary', parseFloat(e.target.value) || 0)}
          />
        </div>
        {scenario.spouse.enabled && (
          <div>
            <label className="input-label">Spouse Monthly Salary ($)</label>
            <input
              type="number"
              className="input-field"
              value={scenario.spouse.currentSalary}
              onChange={e => setField('spouse.currentSalary', parseFloat(e.target.value) || 0)}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="input-label">Salary Growth (%)</label>
          <input
            type="number"
            className="input-field"
            step="0.1"
            value={(scenario.salaryGrowthRate * 100).toFixed(1)}
            onChange={e => setField('salaryGrowthRate', (parseFloat(e.target.value) || 0) / 100)}
          />
        </div>
        <div>
          <label className="input-label">Savings Rate (%)</label>
          <input
            type="number"
            className="input-field"
            step="1"
            value={(scenario.totalSavingsRate * 100).toFixed(0)}
            onChange={e => setField('totalSavingsRate', (parseFloat(e.target.value) || 0) / 100)}
          />
        </div>
      </div>

      <div>
        <label className="input-label">
          Contribution Allocation {allocSum !== 100 && (
            <span className="text-red-500 ml-1">(sum: {allocSum}%, must be 100%)</span>
          )}
        </label>
        <div className="space-y-1">
          {ALLOCATION_ACCOUNTS.map(acct => (
            <div key={acct} className="flex items-center gap-2">
              <span className="text-xs w-28 truncate" title={ACCOUNT_LABELS[acct]}>
                {ACCOUNT_LABELS[acct]}
              </span>
              <input
                type="number"
                className="input-field w-16 text-right"
                min={0}
                max={100}
                value={scenario.contributionAllocation[acct]}
                onChange={e =>
                  setField(`contributionAllocation.${acct}`, parseInt(e.target.value) || 0)
                }
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Employer Match ── */}
      <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
        <label className="input-label font-medium">Employer Match</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="input-label">Match Rate (%)</label>
            <input
              type="number"
              className="input-field"
              step="1"
              min={0}
              max={200}
              value={(scenario.employerMatchRate * 100).toFixed(0)}
              onChange={e => setField('employerMatchRate', (parseFloat(e.target.value) || 0) / 100)}
            />
          </div>
          <div>
            <label className="input-label">Match Cap (% salary)</label>
            <input
              type="number"
              className="input-field"
              step="0.5"
              min={0}
              max={100}
              value={(scenario.employerMatchCapPct * 100).toFixed(1)}
              onChange={e => setField('employerMatchCapPct', (parseFloat(e.target.value) || 0) / 100)}
            />
          </div>
        </div>
        <div>
          <label className="input-label">Employer Match → Roth 401(k) (%)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="input-field w-16 text-right"
              min={0}
              max={100}
              value={scenario.employerRothPct}
              onChange={e => setField('employerRothPct', parseInt(e.target.value) || 0)}
            />
            <span className="text-xs text-gray-400">% Roth, {100 - (scenario.employerRothPct || 0)}% Traditional</span>
          </div>
        </div>
      </div>

      <button
        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? '▾ Hide' : '▸ Show'} Advanced Limits
      </button>

      {showAdvanced && (
        <div className="space-y-2 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="input-label">401(k) Limit ($)</label>
              <input
                type="number"
                className="input-field"
                value={scenario.limit401k}
                onChange={e => setField('limit401k', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="input-label">IRA Limit ($)</label>
              <input
                type="number"
                className="input-field"
                value={scenario.limitIRA}
                onChange={e => setField('limitIRA', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={scenario.enable401kCatchUp}
                onChange={e => setField('enable401kCatchUp', e.target.checked)}
              />
              401(k) Catch-up (50+)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={scenario.enableIRACatchUp}
                onChange={e => setField('enableIRACatchUp', e.target.checked)}
              />
              IRA Catch-up
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
