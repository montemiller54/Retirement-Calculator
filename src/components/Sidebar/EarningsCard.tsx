import { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type AccountType, type Job } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { PctSlider, Section, Field } from './shared';
import { InfoTip } from './InfoTip';
import { ACCOUNT_DESCRIPTIONS } from '../../constants/descriptions';

const ALLOCATION_ACCOUNTS: AccountType[] = [
  'traditional401k', 'roth401k', 'traditionalIRA', 'rothIRA', 'taxable', 'hsa', 'cashAccount', 'otherAssets',
];

export function EarningsCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
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
      name: '',
      monthlyPay: 5000,
      startAge: scenario.retirementAge,
      endAge: scenario.retirementAge + 5,
      has401k: false,
      employerMatchRate: 0,
      employerMatchCapPct: 0,
      employerRothPct: 0,
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
  const totalYearly = totalMonthly * 12;

  return (
    <div className="space-y-8">
      <Section
        title="Jobs"
        description="One row per income source. Each can have its own 401(k) and employer match."
        trailing={totalYearly > 0 ? <span className="font-medium text-gray-700 dark:text-gray-300">${totalYearly.toLocaleString()}/yr</span> : undefined}
      >
        <div className="space-y-3">
          {jobs.map(job => {
            const isActive = scenario.currentAge >= job.startAge && scenario.currentAge <= job.endAge;
            return (
              <div
                key={job.id}
                className={`relative rounded-md border bg-white dark:bg-gray-900/40 p-3 ${
                  isActive
                    ? 'border-gray-200 dark:border-gray-700 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-primary-400 before:rounded-r'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <input
                    className="input-field text-sm font-medium w-2/3"
                    value={job.name}
                    placeholder="e.g., Acme Corp"
                    onChange={e => updateJob(job.id, 'name', e.target.value)}
                  />
                  <div className="flex-1" />
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-[0.625rem] font-medium uppercase tracking-wider text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded">
                      Active
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-500 text-sm px-1"
                    onClick={() => removeJob(job.id)}
                    aria-label="Remove job"
                    title="Remove job"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end max-w-full sm:max-w-[80%]">
                  <Field label="Monthly pay">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                      <CurrencyInput value={job.monthlyPay} onChange={v => updateJob(job.id, 'monthlyPay', v)} />
                    </div>
                  </Field>
                  <Field label="Start age">
                    <input
                      type="number"
                      className={`input-field text-center ${fieldErrorClass(ve, `job.${job.id}.startAge`)}`}
                      value={job.startAge}
                      onChange={e => updateJob(job.id, 'startAge', parseInt(e.target.value) || 0)}
                    />
                  </Field>
                  <Field label="End age">
                    <input
                      type="number"
                      className={`input-field text-center ${fieldErrorClass(ve, `job.${job.id}.endAge`)}`}
                      value={job.endAge}
                      onChange={e => updateJob(job.id, 'endAge', parseInt(e.target.value) || 0)}
                    />
                  </Field>
                </div>
                <FieldError errors={ve} field={`job.${job.id}`} />

                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={job.has401k}
                      onChange={e => updateJob(job.id, 'has401k', e.target.checked)}
                    />
                    Offers a 401(k)
                    {job.has401k && job.employerMatchRate > 0 && job.employerMatchCapPct > 0 && (
                      <span className="text-[0.6875rem] text-green-600 dark:text-green-400 font-medium ml-2">
                        ✓ {Math.round(job.employerMatchRate * 100)}% match on {(job.employerMatchCapPct * 100).toFixed(1)}%
                      </span>
                    )}
                  </label>

                  {job.has401k && (
                    <div className="pl-6 space-y-2">
                      <div className="grid grid-cols-2 gap-2 sm:gap-4 items-end">
                        <PctSlider
                          label="Match rate"
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
                      {job.monthlyPay > 0 && job.employerMatchRate > 0 && job.employerMatchCapPct > 0 && (
                        <p className="text-[0.6875rem] text-primary-600 dark:text-primary-400 font-medium">
                          ≈ Employer contributes ${Math.round(job.monthlyPay * 12 * job.employerMatchCapPct * job.employerMatchRate).toLocaleString()}/yr
                        </p>
                      )}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                        onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                      >
                        <span className="text-sm leading-none">{expandedJobId === job.id ? '−' : '+'}</span>
                        Roth match option
                      </button>
                      {expandedJobId === job.id && (
                        <div className="pl-1">
                          <PctSlider
                            label="Match → Roth 401(k)"
                            value={job.employerRothPct ?? 0}
                            onChange={v => updateJob(job.id, 'employerRothPct', Math.round(v))}
                            min={0} max={100} step={10}
                          />
                          <p className="text-[0.6875rem] text-gray-500 dark:text-gray-400 mt-1">
                            SECURE 2.0: % of employer match deposited to Roth 401(k). Most plans use 0%.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          onClick={addJob}
        >
          <span className="text-base leading-none">+</span> Add job
        </button>
      </Section>

      <Section
        title="Salary growth & savings rate"
        description="How much pay rises each year, and how much of it you save."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          <div>
            <PctSlider
              label="Salary growth"
              value={scenario.salaryGrowthRate * 100}
              onChange={v => setField('salaryGrowthRate', v / 100)}
              min={0} max={10} step={0.5}
            />
            <p className="mt-1 text-[0.6875rem] text-gray-500 dark:text-gray-400">Annual raise rate, before promotions. 1–3% is typical.</p>
          </div>
          <div>
            <PctSlider
              label="Savings rate"
              value={scenario.totalSavingsRate * 100}
              onChange={v => setField('totalSavingsRate', v / 100)}
              min={0} max={60} step={1}
            />
            <p className="mt-1 text-[0.6875rem] text-gray-500 dark:text-gray-400">Portion of pay saved each month. Split across accounts below.</p>
          </div>
        </div>
      </Section>

      <Section
        title="Contribution allocation"
        description="How your monthly savings are split across account types."
        collapsible
        defaultOpen={false}
        trailing={
          <span className={allocSum === 100 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-500 font-medium'}>
            {allocSum}% of 100%{allocSum !== 100 && (allocSum < 100 ? ` — need ${100 - allocSum}% more` : ` — ${allocSum - 100}% over`)}
          </span>
        }
      >
        <div className="space-y-4">
          {/* Preset buttons */}
          <div>
            <p className="text-[0.6875rem] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '100% Trad 401(k)', alloc: { traditional401k: 100, roth401k: 0, traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 } },
                { label: '100% Roth 401(k)', alloc: { traditional401k: 0, roth401k: 100, traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 } },
                { label: '50/50 split', alloc: { traditional401k: 50, roth401k: 50, traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 } },
              ].map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  className="text-xs px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
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
          </div>

          <FieldError errors={ve} field="contributionAllocation" />

          <div className="space-y-1.5">
            {visibleAccounts.map(acct => (
              <div key={acct} className="flex items-center gap-2 py-1">
                <span className="text-sm w-44 shrink-0 text-gray-700 dark:text-gray-200">
                  {ACCOUNT_LABELS[acct]}
                  <InfoTip text={ACCOUNT_DESCRIPTIONS[acct]} />
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    className={`input-field w-16 text-right text-sm ${allocSum !== 100 ? 'border-red-300 dark:border-red-700' : ''}`}
                    min={0} max={100}
                    value={scenario.contributionAllocation[acct]}
                    onChange={e => handleAllocChange(acct, parseInt(e.target.value) || 0)}
                  />
                  <span className="text-xs text-gray-400 w-3">%</span>
                </div>
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-500 text-sm px-1"
                  onClick={() => removeAccount(acct)}
                  title={`Remove ${ACCOUNT_LABELS[acct]}`}
                  aria-label={`Remove ${ACCOUNT_LABELS[acct]}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {hiddenAccounts.length > 0 && (
            <div>
              <select
                className="input-field text-sm w-56"
                value=""
                onChange={e => { if (e.target.value) addAccount(e.target.value as AccountType); }}
              >
                <option value="">+ Add account type…</option>
                {hiddenAccounts.map(acct => (
                  <option key={acct} value={acct}>{ACCOUNT_LABELS[acct]}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
