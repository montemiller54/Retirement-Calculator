import { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { OneTimeExpense } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { Toggle, PctSlider, Section, Field } from './shared';
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
    <div className="space-y-8">
      {!bannerDismissed && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2 flex items-start gap-2">
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed flex-1">
            All amounts are in <strong>today's dollars</strong>. The simulation automatically increases them each year for inflation, so enter what these costs would be if you paid them today.
          </p>
          <button className="text-blue-400 hover:text-blue-600 text-sm leading-none mt-0.5" onClick={() => { setBannerDismissed(true); localStorage.setItem(BANNER_DISMISSED_KEY, '1'); }}>✕</button>
        </div>
      )}

      {/* ── Monthly Spending ── */}
      <Section title="Monthly Spending" description="Your base monthly expenses in today's dollars. Automatically adjusted for inflation.">
        <div className="space-y-4">
          <div>
            <Field label="Monthly amount" help="Exclude mortgage P&I and healthcare if modeled below.">
              <div className="relative w-48">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <CurrencyInput
                  value={scenario.baseAnnualSpending}
                  onChange={v => setField('baseAnnualSpending', v)}
                />
              </div>
            </Field>
          </div>

          <div>
            <PctSlider
              label="Inflation"
              value={scenario.spendingInflationRate * 100}
              onChange={v => setField('spendingInflationRate', v / 100)}
              min={0} max={8} step={0.1}
              tooltip={<InfoTip text="The annual rate your everyday expenses increase. Historically ~2.5-3%. Higher values model more aggressive cost-of-living growth. Tax brackets and IRS limits automatically adjust at 0.3% below this rate." />}
            />
          </div>

          {(hc?.enabled || scenario.housing?.enabled) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Exclude{scenario.housing?.enabled ? ' mortgage P&I' : ''}{scenario.housing?.enabled && hc?.enabled ? ' and' : ''}{hc?.enabled ? ' healthcare' : ''} — modeled below.
            </p>
          )}
        </div>
      </Section>

      {/* ── Housing / Mortgage ── */}
      <Section title="Housing / Mortgage" description="Model your mortgage payment ending at a specific age.">
        <div className="space-y-4">
          <div className="flex items-center gap-1">
            <Toggle
              checked={scenario.housing?.enabled ?? false}
              onChange={v => setField('housing.enabled', v)}
              label="Enable housing model"
            />
            <InfoTip text="Model your mortgage payment ending at a specific age, and optionally include proceeds from downsizing your home." />
          </div>

          {scenario.housing?.enabled && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label={<>Monthly Mortgage <InfoTip text="Enter only principal and interest — exclude taxes, insurance, and HOA fees. Those should be included in your base monthly spending." /></>}>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <CurrencyInput value={scenario.housing.mortgagePayment} onChange={v => setField('housing.mortgagePayment', v)} />
                  </div>
                </Field>
                <Field label={<>Payoff Age <InfoTip text="At this age your mortgage is paid off. The mortgage amount is added on top of your base spending until this age, then drops off." /></>}>
                  <input type="number" className="input-field text-center w-28" value={scenario.housing.payoffAge} onChange={e => setField('housing.payoffAge', parseInt(e.target.value) || 65)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Downsizing Proceeds" help="0 = no downsizing">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <CurrencyInput value={scenario.housing.downsizingProceeds} onChange={v => setField('housing.downsizingProceeds', v)} />
                  </div>
                </Field>
                <Field label="Downsizing Age">
                  <input type="number" className="input-field text-center w-28" value={scenario.housing.downsizingAge} onChange={e => setField('housing.downsizingAge', parseInt(e.target.value) || 70)} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── Healthcare ── */}
      <Section title="Healthcare" description="Healthcare costs by life stage. All amounts in today's dollars.">
        <div className="space-y-4">
          <div className="flex items-center gap-1">
            <Toggle
              checked={hc.enabled}
              onChange={v => setField('healthcare.enabled', v)}
              label="Enable healthcare cost modeling"
            />
          </div>

          {hc.enabled && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
                <Field
                  label={<>Pre-<input type="number" className={`inline-input w-8 ${fieldErrorClass(ve, 'healthcare.medicareStartAge')}`} value={hc.medicareStartAge} onChange={e => setField('healthcare.medicareStartAge', parseInt(e.target.value) || 65)} /> $/mo</>}
                  help={`age ${scenario.retirementAge}–${hc.medicareStartAge - 1}`}
                >
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <CurrencyInput value={hc.preMedicareMonthly} onChange={v => setField('healthcare.preMedicareMonthly', v)} />
                  </div>
                  <FieldError errors={ve} field="healthcare.medicareStartAge" />
                </Field>
                <Field
                  label="Medicare $/mo"
                  help={`age ${hc.medicareStartAge}–${hc.lateLifeStartAge - 1}`}
                >
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <CurrencyInput value={hc.medicareMonthly} onChange={v => setField('healthcare.medicareMonthly', v)} />
                  </div>
                </Field>
                <Field
                  label={<>Late <input type="number" className={`inline-input w-8 ${fieldErrorClass(ve, 'healthcare.lateLifeStartAge')}`} value={hc.lateLifeStartAge} onChange={e => setField('healthcare.lateLifeStartAge', parseInt(e.target.value) || 80)} />+ $/mo</>}
                  help={`age ${hc.lateLifeStartAge}–${scenario.endAge}`}
                >
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <CurrencyInput value={hc.lateLifeMonthly} onChange={v => setField('healthcare.lateLifeMonthly', v)} />
                  </div>
                </Field>
              </div>

              <div className="pt-2">
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
      </Section>

      {/* ── One-Time Expenses ── */}
      <Section
        title="One-Time Expenses"
        description="Lump-sum costs at a specific age (e.g. new car, wedding, home repair)."
      >
        {scenario.oneTimeExpenses.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No one-time expenses added.</p>
        ) : (
          <div className="space-y-3">
            {scenario.oneTimeExpenses.map(exp => (
              <div key={exp.id} className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2">
                <div className="flex flex-wrap gap-2 items-start">
                  <input
                    className="input-field flex-1 min-w-[10rem] text-sm"
                    value={exp.name}
                    onChange={e => updateExpense(exp.id, 'name', e.target.value)}
                    placeholder="Expense name"
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <CurrencyInput value={exp.amount as number} onChange={v => updateExpense(exp.id, 'amount', v)} />
                  </div>
                  <div className="shrink-0 text-center">
                    <input
                      type="number"
                      className={`input-field w-16 text-center text-sm ${fieldErrorClass(ve, `oneTimeExpense.${exp.id}`)}`}
                      value={exp.age}
                      onChange={e => updateExpense(exp.id, 'age', parseInt(e.target.value) || 0)}
                      title="Age"
                    />
                    {exp.age > 0 && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        ({new Date().getFullYear() + (exp.age - scenario.currentAge)})
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-500 text-sm px-1 shrink-0 mt-2"
                    onClick={() => removeExpense(exp.id)}
                    aria-label="Remove expense"
                  >✕</button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={exp.inflationAdjusted} onChange={e => updateExpense(exp.id, 'inflationAdjusted', e.target.checked)} className="accent-primary-600" />
                    Inflation-adjusted
                  </label>
                </div>
                <FieldError errors={ve} field={`oneTimeExpense.${exp.id}`} />
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          onClick={addExpense}
        >
          <span className="text-base leading-none">+</span> Add expense
        </button>
      </Section>
    </div>
  );
}
