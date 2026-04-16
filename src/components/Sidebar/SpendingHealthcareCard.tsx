import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { OneTimeExpense } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-500'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

function PctSlider({ value, onChange, label, min = 0, max = 10, step = 0.1, suffix = '%' }: {
  value: number; onChange: (v: number) => void; label: string;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="input-label mb-0">{label}</label>
        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{value.toFixed(step < 1 ? 1 : 0)}{suffix}</span>
      </div>
      <input
        type="range"
        className="w-full h-1.5 accent-primary-600 cursor-pointer"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function SpendingHealthcareCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const hc = scenario.healthcare;

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
      <div>
        <p className="text-[10px] text-gray-400 mb-3">Monthly spending in retirement and healthcare costs.</p>

        <div>
          <label className="input-label">Base Monthly Spending (today's $)</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
            <CurrencyInput
              value={scenario.baseAnnualSpending}
              onChange={v => setField('baseAnnualSpending', v)}
            />
          </div>
          {scenario.baseAnnualSpending > 0 && (
            <div className="text-[10px] text-gray-400 text-right mt-0.5">
              ${(scenario.baseAnnualSpending * 12).toLocaleString()}/yr
            </div>
          )}
          {hc.enabled && (
            <p className="text-[10px] text-amber-500 mt-1">Exclude healthcare costs — they are modeled separately below.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PctSlider
          label="Spending Inflation"
          value={scenario.spendingInflationRate * 100}
          onChange={v => setField('spendingInflationRate', v / 100)}
          min={0} max={8} step={0.1}
        />
        <PctSlider
          label="Tax Threshold Increases"
          value={((scenario.taxBracketInflationRate ?? 0.02) * 100)}
          onChange={v => setField('taxBracketInflationRate', v / 100)}
          min={0} max={5} step={0.1}
        />
      </div>

      {/* One-time expenses */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">One-Time Expenses</label>
          <button
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            onClick={addExpense}
          >
            + Add
          </button>
        </div>
        {scenario.oneTimeExpenses.map(exp => (
          <div key={exp.id} className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs space-y-1">
            <div className="flex gap-1">
              <input
                className="input-field flex-1"
                value={exp.name}
                onChange={e => updateExpense(exp.id, 'name', e.target.value)}
              />
              <button className="text-red-400 hover:text-red-600 px-1" onClick={() => removeExpense(exp.id)}>✕</button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="input-label">Amount ($)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={exp.amount as number} onChange={v => updateExpense(exp.id, 'amount', v)} />
                </div>
              </div>
              <div className="w-16">
                <label className="input-label">Age</label>
                <input type="number" className={`input-field ${fieldErrorClass(ve, `oneTimeExpense.${exp.id}`)}`} value={exp.age} onChange={e => updateExpense(exp.id, 'age', parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <FieldError errors={ve} field={`oneTimeExpense.${exp.id}`} />
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={exp.inflationAdjusted} onChange={e => updateExpense(exp.id, 'inflationAdjusted', e.target.checked)} className="accent-primary-600" />
              Inflation-adjusted
            </label>
          </div>
        ))}
      </div>

      {/* Healthcare */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <Toggle
          checked={hc.enabled}
          onChange={v => setField('healthcare.enabled', v)}
          label="Healthcare Cost Modeling"
        />

        {hc.enabled && (
          <div className="space-y-3">
            <div className="space-y-2">
              <div>
                <label className="input-label">Before Age 65 Monthly ($)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={hc.preMedicareMonthly} onChange={v => setField('healthcare.preMedicareMonthly', v)} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Retirement to age {hc.medicareStartAge - 1}</p>
              </div>
              <div>
                <label className="input-label">Medicare Monthly ($)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={hc.medicareMonthly} onChange={v => setField('healthcare.medicareMonthly', v)} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Age {hc.medicareStartAge}–{hc.lateLifeStartAge - 1}</p>
              </div>
              <div>
                <label className="input-label">Late-Life Monthly ($)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={hc.lateLifeMonthly} onChange={v => setField('healthcare.lateLifeMonthly', v)} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Age {hc.lateLifeStartAge}+</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="input-label">Medicare Start</label>
                <input type="number" className={`input-field text-center ${fieldErrorClass(ve, 'healthcare.medicareStartAge')}`} value={hc.medicareStartAge} onChange={e => setField('healthcare.medicareStartAge', parseInt(e.target.value) || 65)} />
                <FieldError errors={ve} field="healthcare.medicareStartAge" />
              </div>
              <div>
                <label className="input-label">Late-Life Start</label>
                <input type="number" className={`input-field text-center ${fieldErrorClass(ve, 'healthcare.lateLifeStartAge')}`} value={hc.lateLifeStartAge} onChange={e => setField('healthcare.lateLifeStartAge', parseInt(e.target.value) || 80)} />
              </div>
            </div>

            <div>
              <PctSlider
                label="Medical Inflation"
                value={hc.inflationRate * 100}
                onChange={v => setField('healthcare.inflationRate', v / 100)}
                min={0} max={10} step={0.1}
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Healthcare costs typically rise ~5% per year</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
