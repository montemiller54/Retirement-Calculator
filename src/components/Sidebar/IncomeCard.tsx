import { useScenario } from '../../context/ScenarioContext';
import type { IncomeSource } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { Toggle, PctSlider, Section, Field } from './shared';
import { estimateSSBenefit } from '../../utils/social-security';
import { InfoTip } from './InfoTip';

export function IncomeCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;

  const isAuto = scenario.socialSecurityMode === 'auto';
  const jobs = scenario.jobs ?? [];
  const highestSalary = jobs.length > 0 ? Math.max(...jobs.map(j => j.monthlyPay)) : 0;
  const estimatedSS = estimateSSBenefit(highestSalary, scenario.socialSecurityClaimAge, scenario.currentAge);

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
    <div className="space-y-8">
      {/* ── Your Social Security ── */}
      <Section
        title={scenario.spouse?.enabled ? 'Your Social Security' : 'Social Security'}
        trailing={
          <Toggle
            checked={isAuto}
            onChange={v => setField('socialSecurityMode', v ? 'auto' : 'manual')}
            label="Estimate from salary"
          />
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monthly Benefit">
              {isAuto ? (
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <div className="input-field pl-6 text-right bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-default">
                    {estimatedSS.toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={scenario.socialSecurityBenefit} onChange={v => setField('socialSecurityBenefit', v)} />
                </div>
              )}
            </Field>
            <Field label="Claim Age">
              <input type="number" className="input-field text-center w-28" value={scenario.socialSecurityClaimAge} min={62} max={70} onChange={e => setField('socialSecurityClaimAge', parseInt(e.target.value) || 67)} />
            </Field>
          </div>

          {isAuto && (
            <p className={`text-xs italic ${jobs.length === 0 || highestSalary === 0 ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {jobs.length === 0 || highestSalary === 0
                ? 'No jobs found — using last saved benefit. Add a job or switch to manual for accuracy.'
                : `Estimated from $${(highestSalary * 12).toLocaleString()}/yr (highest job salary) using SSA formula`}
            </p>
          )}

          <PctSlider
            label="Yearly Increase (COLA)"
            value={scenario.socialSecurityCOLA * 100}
            onChange={v => setField('socialSecurityCOLA', parseFloat((v / 100).toFixed(4)))}
            min={0} max={5} step={0.1}
            tooltip={<InfoTip text="Cost-of-Living Adjustment (COLA) — the annual percentage increase to your Social Security benefit to keep up with inflation. The historical average is about 2.5%." />}
          />
        </div>
      </Section>

      {/* ── Spouse Social Security ── */}
      {scenario.spouse?.enabled && (
        <Section title="Spouse Social Security">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Monthly Benefit">
                {isAuto ? (
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <div className="input-field pl-6 text-right bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-default">
                      {Math.round(estimatedSS * 0.5).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <CurrencyInput value={scenario.spouse.socialSecurityBenefit} onChange={v => setField('spouse.socialSecurityBenefit', v)} />
                  </div>
                )}
              </Field>
              <Field label="Claim Age">
                <input type="number" className="input-field text-center w-28" value={scenario.spouse.socialSecurityClaimAge} min={62} max={70} onChange={e => setField('spouse.socialSecurityClaimAge', parseInt(e.target.value) || 67)} />
              </Field>
            </div>
            {isAuto && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                Spousal benefit: 50% of your ${estimatedSS.toLocaleString()}/mo benefit
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ── Pension ── */}
      <Section
        title="Pension"
        trailing={
          <div className="flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              type="button"
              className={`text-xs px-3 py-1 ${scenario.pensionType !== 'lumpSum' ? 'bg-primary-600 text-white font-semibold' : 'bg-transparent text-gray-500 dark:text-gray-400'}`}
              onClick={() => setField('pensionType', 'annuity')}
            >
              Annuity
            </button>
            <button
              type="button"
              className={`text-xs px-3 py-1 ${scenario.pensionType === 'lumpSum' ? 'bg-primary-600 text-white font-semibold' : 'bg-transparent text-gray-500 dark:text-gray-400'}`}
              onClick={() => setField('pensionType', 'lumpSum')}
            >
              Lump Sum
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={scenario.pensionType === 'lumpSum' ? 'Total Amount' : 'Monthly Amount'}>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <CurrencyInput value={scenario.pensionAmount} onChange={v => setField('pensionAmount', v)} />
              </div>
            </Field>
            <Field label={scenario.pensionType === 'lumpSum' ? 'Payout Age' : 'Start Age'}>
              <input type="number" className={`input-field text-center w-28 ${fieldErrorClass(ve, 'pensionStartAge')}`} value={scenario.pensionStartAge} onChange={e => setField('pensionStartAge', parseInt(e.target.value) || 65)} />
              <FieldError errors={ve} field="pensionStartAge" />
            </Field>
          </div>

          {scenario.pensionType === 'lumpSum' ? (
            <Field label="Deposit Into">
              <select
                className="input-field w-auto text-sm"
                value={scenario.pensionLumpSumAccount ?? 'traditionalIRA'}
                onChange={e => setField('pensionLumpSumAccount', e.target.value as 'traditionalIRA' | 'taxable')}
              >
                <option value="traditionalIRA">Traditional IRA (rollover)</option>
                <option value="taxable">Taxable (cash out)</option>
              </select>
            </Field>
          ) : (
            <PctSlider
              label="Yearly Increase"
              value={scenario.pensionCOLA * 100}
              onChange={v => setField('pensionCOLA', parseFloat((v / 100).toFixed(4)))}
              min={0} max={5} step={0.1}
            />
          )}

          {scenario.pensionType === 'lumpSum' && scenario.pensionLumpSumAccount === 'taxable' && scenario.pensionAmount > 0 && (
            <p className="text-xs text-amber-500 italic">
              Cash-out is taxed as ordinary income in the payout year.
            </p>
          )}
          {scenario.pensionType === 'lumpSum' && scenario.pensionLumpSumAccount === 'traditionalIRA' && scenario.pensionAmount > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
              Rolled into Traditional IRA — tax-deferred until withdrawal.
            </p>
          )}
        </div>
      </Section>

      {/* ── Other Income ── */}
      <Section
        title="Other Income"
        description="Rental income, side work, or any other recurring income in retirement."
      >
        {scenario.otherIncomeSources.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No other income sources added.</p>
        ) : (
          <div className="space-y-3">
            {scenario.otherIncomeSources.map(src => (
              <div key={src.id} className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input className="input-field w-48 text-sm" value={src.name} onChange={e => updateOtherIncome(src.id, 'name', e.target.value)} placeholder="Income name" />
                  <div className="flex-1" />
                  <button type="button" className="text-gray-400 hover:text-red-500 text-sm px-1" onClick={() => removeOtherIncome(src.id)} aria-label="Remove income">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Monthly amount">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                      <CurrencyInput value={src.annualAmount as number} onChange={v => updateOtherIncome(src.id, 'annualAmount', v)} />
                    </div>
                  </Field>
                  <Field label="Start age">
                    <input type="number" className={`input-field text-center w-20 ${fieldErrorClass(ve, `otherIncome.${src.id}`)}`} value={src.startAge} onChange={e => updateOtherIncome(src.id, 'startAge', parseInt(e.target.value) || 0)} />
                  </Field>
                  <Field label="End age">
                    <input type="number" className={`input-field text-center w-20 ${fieldErrorClass(ve, `otherIncome.${src.id}`)}`} value={src.endAge} onChange={e => updateOtherIncome(src.id, 'endAge', parseInt(e.target.value) || 0)} />
                  </Field>
                </div>
                <FieldError errors={ve} field={`otherIncome.${src.id}`} />
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          onClick={addOtherIncome}
        >
          <span className="text-base leading-none">+</span> Add income source
        </button>
      </Section>
    </div>
  );
}
