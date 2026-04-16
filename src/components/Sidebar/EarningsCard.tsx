import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { ACCOUNT_LABELS, type AccountType } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { PctSlider } from './shared';

const ALLOCATION_ACCOUNTS: AccountType[] = [
  'traditional401k', 'roth401k', 'traditionalIRA', 'rothIRA', 'taxable', 'hsa', 'cashAccount', 'otherAssets',
];

function DollarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <label className="input-label">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
        <CurrencyInput value={value} onChange={onChange} />
      </div>
    </div>
  );
}

export function EarningsCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const [showDetails, setShowDetails] = useState(false);

  const allocSum = ALLOCATION_ACCOUNTS.reduce(
    (s, a) => s + (scenario.contributionAllocation[a] || 0), 0
  );

  const totalMonthly = scenario.currentSalary + (scenario.spouse.enabled ? scenario.spouse.currentSalary : 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] text-gray-400 mb-3">Current income and how you save it.</p>

        <div className={`grid ${scenario.spouse.enabled ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          <DollarInput
            label={scenario.spouse.enabled ? 'Your Monthly Salary' : 'Monthly Salary'}
            value={scenario.currentSalary}
            onChange={v => setField('currentSalary', v)}
          />
          {scenario.spouse.enabled && (
            <DollarInput
              label="Spouse Monthly Salary"
              value={scenario.spouse.currentSalary}
              onChange={v => setField('spouse.currentSalary', v)}
            />
          )}
        </div>
        {totalMonthly > 0 && (
          <div className="mt-1 text-[10px] text-gray-400 text-right">
            ${(totalMonthly * 12).toLocaleString()}/yr combined
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PctSlider
          label="Salary Growth"
          value={scenario.salaryGrowthRate * 100}
          onChange={v => setField('salaryGrowthRate', v / 100)}
          min={0} max={10} step={0.5}
        />

        <PctSlider
          label="Savings Rate"
          value={scenario.totalSavingsRate * 100}
          onChange={v => setField('totalSavingsRate', v / 100)}
          min={0} max={60} step={1}
        />
      </div>

      {/* Contribution allocation — collapsible */}
      <button
        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-md border transition-colors ${
          showDetails
            ? 'bg-primary-50 dark:bg-primary-900/50 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 font-medium'
            : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60'
        }`}
        onClick={() => setShowDetails(!showDetails)}
      >
        <span>Allocations & Matches</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''} ${showDetails ? 'text-primary-500' : 'text-gray-400'}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {showDetails && (
        <div className="space-y-3">
          {/* Allocation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="input-label mb-0">Allocation</label>
              <span className={`text-[10px] font-medium ${allocSum === 100 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {allocSum}% of 100%{allocSum !== 100 && (allocSum < 100 ? ` — need ${100 - allocSum}% more` : ` — ${allocSum - 100}% over`)}
              </span>
            </div>
            <FieldError errors={ve} field="contributionAllocation" />
            <div className="space-y-1">
              {ALLOCATION_ACCOUNTS.map(acct => (
                <div key={acct} className="flex items-center gap-2">
                  <span className="text-[11px] w-28 truncate text-gray-600 dark:text-gray-400" title={ACCOUNT_LABELS[acct]}>
                    {ACCOUNT_LABELS[acct]}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      className={`input-field w-14 text-right text-[11px] py-0.5 px-1.5 ${allocSum !== 100 ? 'border-red-300 dark:border-red-700' : ''}`}
                      min={0} max={100}
                      value={scenario.contributionAllocation[acct]}
                      onChange={e => setField(`contributionAllocation.${acct}`, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    />
                    <span className="text-[10px] text-gray-400">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Employer match */}
          <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <label className="input-label font-medium">Employer Match</label>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 -mt-1">
              Employer matches {Math.round(scenario.employerMatchRate * 100)}% of your contributions on the first {(scenario.employerMatchCapPct * 100).toFixed(1)}% of salary.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <PctSlider
                label="Match Rate"
                value={scenario.employerMatchRate * 100}
                onChange={v => setField('employerMatchRate', v / 100)}
                min={0} max={200} step={5}
              />
              <PctSlider
                label="Cap (% of salary)"
                value={scenario.employerMatchCapPct * 100}
                onChange={v => setField('employerMatchCapPct', v / 100)}
                min={0} max={15} step={0.5}
              />
            </div>
            <PctSlider
              label="Match → Roth 401(k)"
              value={scenario.employerRothPct}
              onChange={v => setField('employerRothPct', Math.round(v))}
              min={0} max={100} step={10}
            />
          </div>
        </div>
      )}
    </div>
  );
}
