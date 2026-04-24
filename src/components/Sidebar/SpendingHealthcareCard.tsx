import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { OneTimeExpense } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { Toggle, PctSlider } from './shared';
import { InfoTip } from './InfoTip';

const BANNER_DISMISSED_KEY = 'spending-banner-dismissed';

export function SpendingHealthcareCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const hc = scenario.healthcare;
  const [bannerDismissed, setBannerDismissed] = useState(() => localStorage.getItem(BANNER_DISMISSED_KEY) === '1');

  const addExpense = () => {
    const newExpense: OneTimeExpense = {
      id: crypto.randomUUID(),
      name: 'New Expense',
      amount: 10000,
      age: scenario.retirementAge,
      inflationAdjusted: true,
    };
    setField('oneTimeExpenses', [...scenario.oneTimeExpenses, newExpense]);
  };

  const removeExpense = (id: string) => {
    setField('oneTimeExpenses', scenario.oneTimeExpenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, field: keyof OneTimeExpense, value: unknown) => {
    setField(
      'oneTimeExpenses',
      scenario.oneTimeExpenses.map(e => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };

  return (
    <div className="space-y-4">
      {!bannerDismissed && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded px-2.5 py-1.5 flex items-start gap-1">
          <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed flex-1">
            All amounts are in <strong>today's dollars</strong>. The simulation automatically increases them each year for inflation, so enter what these costs would be if you paid them today.
          </p>
          <button className="text-blue-400 hover:text-blue-600 text-xs leading-none mt-0.5" onClick={() => { setBannerDismissed(true); localStorage.setItem(BANNER_DISMISSED_KEY, '1'); }}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-[1fr_100px] gap-2 items-end">
        <div>
          <label className="input-label">Monthly Spending</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
            <CurrencyInput
              value={scenario.baseAnnualSpending}
              onChange={v => setField('baseAnnualSpending', v)}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Today's $</p>
        </div>
        <PctSlider
          label="Inflation"
          value={scenario.spendingInflationRate * 100}
          onChange={v => setField('spendingInflationRate', v / 100)}
          min={0} max={8} step={0.1}
          tooltip={<InfoTip text="The annual rate your everyday expenses increase. Historically ~2.5-3%. Higher values model more aggressive cost-of-living growth. Tax brackets and IRS limits automatically adjust at 0.3% below this rate." />}
        />
      </div>
      {(hc?.enabled || scenario.housing?.enabled) && (
        <p className="text-[10px] text-amber-500 -mt-2">Exclude{scenario.housing?.enabled ? ' mortgage P&I' : ''}{scenario.housing?.enabled && hc?.enabled ? ' and' : ''}{hc?.enabled ? ' healthcare' : ''} — modeled below.</p>
      )}

      {/* Housing / Mortgage */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-center gap-1">
          <Toggle
            checked={scenario.housing?.enabled ?? false}
            onChange={v => setField('housing.enabled', v)}
            label="Housing / Mortgage"
          />
          <InfoTip text="Model your mortgage payment ending at a specific age, and optionally include proceeds from downsizing your home." />
        </div>
        {scenario.housing?.enabled && (
          <div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="input-label">Monthly Mortgage
                  <InfoTip text="Enter only principal and interest — exclude taxes, insurance, and HOA fees. Those should be included in your base monthly spending." />
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={scenario.housing.mortgagePayment} onChange={v => setField('housing.mortgagePayment', v)} />
                </div>
              </div>
              <div>
                <label className="input-label">Payoff Age
                  <InfoTip text="At this age your mortgage is paid off. During retirement, the mortgage amount is added on top of your base spending until this age, then it drops off — so your base spending should not include mortgage P&I." />
                </label>
                <input type="number" className="input-field text-center" value={scenario.housing.payoffAge} onChange={e => setField('housing.payoffAge', parseInt(e.target.value) || 65)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <div>
                <label className="input-label">Downsizing Proceeds</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={scenario.housing.downsizingProceeds} onChange={v => setField('housing.downsizingProceeds', v)} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">0 = no downsizing</p>
              </div>
              <div>
                <label className="input-label">Downsizing Age</label>
                <input type="number" className="input-field text-center" value={scenario.housing.downsizingAge} onChange={e => setField('housing.downsizingAge', parseInt(e.target.value) || 70)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Healthcare */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-center gap-1">
          <Toggle
            checked={hc.enabled}
            onChange={v => setField('healthcare.enabled', v)}
            label="Healthcare Cost Modeling"
          />
        </div>

        {hc.enabled && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="input-label">Pre-<input type="number" className={`inline-input w-8 ${fieldErrorClass(ve, 'healthcare.medicareStartAge')}`} value={hc.medicareStartAge} onChange={e => setField('healthcare.medicareStartAge', parseInt(e.target.value) || 65)} /> $/mo</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={hc.preMedicareMonthly} onChange={v => setField('healthcare.preMedicareMonthly', v)} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 text-center">age {scenario.retirementAge}–{hc.medicareStartAge - 1}</p>
                <FieldError errors={ve} field="healthcare.medicareStartAge" />
              </div>
              <div>
                <label className="input-label">Medicare $/mo</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={hc.medicareMonthly} onChange={v => setField('healthcare.medicareMonthly', v)} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 text-center">age {hc.medicareStartAge}–{hc.lateLifeStartAge - 1}</p>
              </div>
              <div>
                <label className="input-label">Late <input type="number" className={`inline-input w-8 ${fieldErrorClass(ve, 'healthcare.lateLifeStartAge')}`} value={hc.lateLifeStartAge} onChange={e => setField('healthcare.lateLifeStartAge', parseInt(e.target.value) || 80)} />+ $/mo</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={hc.lateLifeMonthly} onChange={v => setField('healthcare.lateLifeMonthly', v)} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 text-center">age {hc.lateLifeStartAge}–{scenario.endAge}</p>
              </div>
            </div>

            <div className="pt-4">
              <PctSlider
                label="Medical Inflation"
                value={hc.inflationRate * 100}
                onChange={v => setField('healthcare.inflationRate', v / 100)}
                min={0} max={10} step={0.1}
              />
            </div>
          </div>
        )}
      </div>

      {/* One-time expenses */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">One-Time Expenses</label>
          <button
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            onClick={addExpense}
          >
            + Add
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 mb-1">Lump-sum costs at a specific age (e.g. new car, wedding, home repair)</p>
        {scenario.oneTimeExpenses.map(exp => (
          <div key={exp.id} className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs space-y-1">
            <div className="flex gap-1 items-center">
              <input
                className="input-field flex-1 min-w-0"
                value={exp.name}
                onChange={e => updateExpense(exp.id, 'name', e.target.value)}
              />
              <div className="relative flex-shrink-0 w-24">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <CurrencyInput value={exp.amount as number} onChange={v => updateExpense(exp.id, 'amount', v)} />
              </div>
              <input type="number" className={`input-field flex-shrink-0 w-12 text-center ${fieldErrorClass(ve, `oneTimeExpense.${exp.id}`)}`} value={exp.age} onChange={e => updateExpense(exp.id, 'age', parseInt(e.target.value) || 0)} title="Age" />
              <button className="text-red-400 hover:text-red-600 px-0.5 flex-shrink-0" onClick={() => removeExpense(exp.id)}>✕</button>
            </div>
            <FieldError errors={ve} field={`oneTimeExpense.${exp.id}`} />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={exp.inflationAdjusted} onChange={e => updateExpense(exp.id, 'inflationAdjusted', e.target.checked)} className="accent-primary-600" />
                Inflation-adjusted
              </label>
              {exp.age > 0 && <span className="text-[10px] text-gray-400">({new Date().getFullYear() + (exp.age - scenario.currentAge)})</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
