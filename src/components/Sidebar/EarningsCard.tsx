import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type AccountType, type Job } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { PctSlider } from './shared';
import { InfoTip } from './InfoTip';
import { ACCOUNT_DESCRIPTIONS } from '../../constants/descriptions';

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
  const [showMatchAdvanced, setShowMatchAdvanced] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const jobs = scenario.jobs ?? [];

  const allocSum = ACCOUNT_TYPES.reduce(
    (s, a) => s + (scenario.contributionAllocation[a] || 0), 0
  );

  const visibleAccounts = scenario.visibleAccounts ?? ['traditional401k', 'cashAccount'];
  const hiddenAccounts = ACCOUNT_TYPES.filter(a => !visibleAccounts.includes(a));

  const addAccount = (acct: AccountType) => {
    setField('visibleAccounts', [...visibleAccounts, acct]);
  };

  const removeAccount = (acct: AccountType) => {
    const balance = scenario.balances[acct] || 0;
    const alloc = scenario.contributionAllocation[acct] || 0;
    if (balance > 0 || alloc > 0) {
      if (!window.confirm(`${ACCOUNT_LABELS[acct]} has a balance of $${balance.toLocaleString()} and ${alloc}% allocation. Removing it will zero out both. Continue?`)) {
        return;
      }
      setField(`balances.${acct}`, 0);
      setField(`contributionAllocation.${acct}`, 0);
    }
    setField('visibleAccounts', visibleAccounts.filter(a => a !== acct));
  };

  const handleAllocChange = (changedAcct: AccountType, newValue: number) => {
    newValue = Math.max(0, Math.min(100, newValue));
    setField(`contributionAllocation.${changedAcct}`, newValue);
  };

  const addJob = () => {
    const newJob: Job = {
      id: crypto.randomUUID(),
      name: `Job ${jobs.length + 1}`,
      monthlyPay: 5000,
      startAge: scenario.retirementAge,
      endAge: scenario.retirementAge + 5,
      has401k: false,
      employerMatchRate: 0,
      employerMatchCapPct: 0,
    };
    setField('jobs', [...jobs, newJob]);
    setExpandedJobId(newJob.id);
  };

  const removeJob = (id: string) => {
    setField('jobs', jobs.filter(j => j.id !== id));
    if (expandedJobId === id) setExpandedJobId(null);
  };

  const updateJob = (id: string, field: keyof Job, value: unknown) => {
    setField(
      'jobs',
      jobs.map(j => (j.id === id ? { ...j, [field]: value } : j)),
    );
  };

  // Total current monthly income from active jobs
  const activeJobs = jobs.filter(j => scenario.currentAge >= j.startAge && scenario.currentAge <= j.endAge);
  const totalMonthly = activeJobs.reduce((sum, j) => sum + j.monthlyPay, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] text-gray-400 mb-3">Your jobs, income, and how you save it.</p>

        {/* Jobs list */}
        <div className="space-y-2">
          {jobs.map(job => {
            const isActive = scenario.currentAge >= job.startAge && scenario.currentAge <= job.endAge;
            const isExpanded = expandedJobId === job.id;
            return (
              <div key={job.id} className={`p-2 rounded border text-xs space-y-1.5 ${isActive ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-1">
                  <input
                    className="input-field flex-1 text-xs py-0.5"
                    value={job.name}
                    onChange={e => updateJob(job.id, 'name', e.target.value)}
                  />
                  {isActive && (
                    <span className="text-[9px] text-green-600 dark:text-green-400 font-medium px-1">Active</span>
                  )}
                  <button className="text-red-400 hover:text-red-600 px-1" onClick={() => removeJob(job.id)}>✕</button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <DollarInput label="$/mo" value={job.monthlyPay} onChange={v => updateJob(job.id, 'monthlyPay', v)} />
                  <div>
                    <label className="input-label">Start Age</label>
                    <input type="number" className={`input-field text-center ${fieldErrorClass(ve, `job.${job.id}.startAge`)}`} value={job.startAge} onChange={e => updateJob(job.id, 'startAge', parseInt(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="input-label">End Age</label>
                    <input type="number" className={`input-field text-center ${fieldErrorClass(ve, `job.${job.id}.startAge`)}`} value={job.endAge} onChange={e => updateJob(job.id, 'endAge', parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <FieldError errors={ve} field={`job.${job.id}`} />

                <button
                  className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                >
                  {isExpanded ? '▾ Hide 401(k) & Match' : '▸ 401(k) & Match'}
                </button>

                {isExpanded && (
                  <div className="pt-1.5 border-t border-gray-200 dark:border-gray-600 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-gray-600 dark:text-gray-400">Has 401(k)?</label>
                      <input type="checkbox" checked={job.has401k} onChange={e => updateJob(job.id, 'has401k', e.target.checked)} />
                    </div>
                    {job.has401k && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          Employer matches {Math.round(job.employerMatchRate * 100)}% of your contributions on the first {(job.employerMatchCapPct * 100).toFixed(1)}% of salary.
                        </p>
                        {job.monthlyPay > 0 && job.employerMatchRate > 0 && (
                          <p className="text-[10px] text-primary-600 dark:text-primary-400 font-medium">
                            ≈ Employer contributes ${Math.round(job.monthlyPay * 12 * job.employerMatchCapPct * job.employerMatchRate).toLocaleString()}/yr
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <PctSlider
                            label="Match Rate"
                            value={job.employerMatchRate * 100}
                            onChange={v => updateJob(job.id, 'employerMatchRate', v / 100)}
                            min={0} max={200} step={5}
                          />
                          <PctSlider
                            label="Cap (% of salary)"
                            value={job.employerMatchCapPct * 100}
                            onChange={v => updateJob(job.id, 'employerMatchCapPct', v / 100)}
                            min={0} max={15} step={0.5}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:underline" onClick={addJob}>
          + Add Job
        </button>
        {totalMonthly > 0 && (
          <div className="mt-1 text-[10px] text-gray-400 text-right">
            ${(totalMonthly * 12).toLocaleString()}/yr current income
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
              <label className="input-label mb-0">Allocation
                <InfoTip text="How your savings are split across different account types. Each account has different tax rules. The percentages must add up to 100%." />
              </label>
              <span className={`text-[10px] font-medium ${allocSum === 100 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {allocSum}% of 100%{allocSum !== 100 && (allocSum < 100 ? ` — need ${100 - allocSum}% more` : ` — ${allocSum - 100}% over`)}
              </span>
            </div>
            {/* Preset buttons */}
            <div className="flex gap-1 mb-2">
              {[
                { label: '100% Trad 401(k)', alloc: { traditional401k: 100, roth401k: 0, traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 } },
                { label: '100% Roth 401(k)', alloc: { traditional401k: 0, roth401k: 100, traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 } },
                { label: '50/50 Split', alloc: { traditional401k: 50, roth401k: 50, traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 } },
              ].map(preset => (
                <button
                  key={preset.label}
                  className="flex-1 text-[10px] py-1 rounded border border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  onClick={() => {
                    ALLOCATION_ACCOUNTS.forEach(acct => {
                      setField(`contributionAllocation.${acct}`, (preset.alloc as Record<string, number>)[acct] ?? 0);
                    });
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <FieldError errors={ve} field="contributionAllocation" />
            <div className="space-y-1">
              {visibleAccounts.map(acct => (
                <div key={acct} className="flex items-center gap-2">
                  <span className="text-[11px] w-28 truncate text-gray-600 dark:text-gray-400" title={ACCOUNT_LABELS[acct]}>
                    {ACCOUNT_LABELS[acct]}
                    <InfoTip text={ACCOUNT_DESCRIPTIONS[acct]} />
                  </span>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      className={`input-field w-14 text-right text-[11px] py-0.5 px-1.5 ${allocSum !== 100 ? 'border-red-300 dark:border-red-700' : ''}`}
                      min={0} max={100}
                      value={scenario.contributionAllocation[acct]}
                      onChange={e => handleAllocChange(acct, parseInt(e.target.value) || 0)}
                    />
                    <span className="text-[10px] text-gray-400">%</span>
                  </div>
                  <button
                    className="text-red-400 hover:text-red-600 text-xs px-0.5"
                    onClick={() => removeAccount(acct)}
                    title={`Remove ${ACCOUNT_LABELS[acct]}`}
                  >✕</button>
                </div>
              ))}
            </div>
            {hiddenAccounts.length > 0 && (
              <div className="mt-2">
                <select
                  className="input-field text-[11px] py-1"
                  value=""
                  onChange={e => { if (e.target.value) addAccount(e.target.value as AccountType); }}
                >
                  <option value="">+ Add account type...</option>
                  {hiddenAccounts.map(acct => (
                    <option key={acct} value={acct}>{ACCOUNT_LABELS[acct]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Advanced employer match options */}
          <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button
              className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              onClick={() => setShowMatchAdvanced(!showMatchAdvanced)}
            >
              {showMatchAdvanced ? '▾ Hide advanced match options' : '▸ Advanced match options'}
            </button>
            {showMatchAdvanced && (
              <PctSlider
                label="Match → Roth 401(k)"
                value={scenario.employerRothPct}
                onChange={v => setField('employerRothPct', Math.round(v))}
                min={0} max={100} step={10}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
