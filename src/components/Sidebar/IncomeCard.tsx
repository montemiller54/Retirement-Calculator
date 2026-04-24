import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { IncomeSource } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { Toggle } from './shared';
import { estimateSSBenefit } from '../../utils/social-security';
import { InfoTip } from './InfoTip';

export function IncomeCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;

  const isAuto = scenario.socialSecurityMode === 'auto';
  const estimatedSS = estimateSSBenefit(scenario.currentSalary, scenario.socialSecurityClaimAge, scenario.currentAge);
  const estimatedSpouseSS = scenario.spouse?.enabled
    ? scenario.spouse.currentSalary > 0
      ? estimateSSBenefit(scenario.spouse.currentSalary, scenario.spouse.socialSecurityClaimAge, scenario.spouse.currentAge)
      : Math.round(estimatedSS * 0.5)
    : 0;

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
    <div className="space-y-4">
      <p className="text-[10px] text-gray-400 mb-1">Social Security, pensions, and other income in retirement. All amounts are in <strong>today's dollars</strong>.</p>

      {/* Your Social Security */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {scenario.spouse?.enabled ? 'Your Social Security' : 'Social Security'}
          </label>
          <Toggle
            checked={isAuto}
            onChange={v => setField('socialSecurityMode', v ? 'auto' : 'manual')}
            label="Estimate from salary"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="input-label">Monthly Benefit</label>
            {isAuto ? (
              <div className="input-field bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-default pl-6">
                ${estimatedSS.toLocaleString()}
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <CurrencyInput value={scenario.socialSecurityBenefit} onChange={v => setField('socialSecurityBenefit', v)} />
              </div>
            )}
          </div>
          <div>
            <label className="input-label">Claim Age</label>
            <input type="number" className="input-field text-center" value={scenario.socialSecurityClaimAge} min={62} max={70} onChange={e => setField('socialSecurityClaimAge', parseInt(e.target.value) || 67)} />
          </div>
        </div>
        {isAuto && (
          <p className={`text-[10px] italic ${scenario.currentAge >= scenario.retirementAge && scenario.currentSalary === 0 ? 'text-amber-500' : 'text-gray-400'}`}>
            {scenario.currentAge >= scenario.retirementAge && scenario.currentSalary === 0
              ? 'Warning: auto-estimate uses salary ($0). Switch to manual and enter your actual SS benefit.'
              : `Estimated from $${(scenario.currentSalary * 12).toLocaleString()}/yr salary using Social Security Administration formula`}
          </p>
        )}
        <div className="flex items-center justify-between">
          <label className="input-label mb-0">Yearly Increase
            <InfoTip text="Cost-of-Living Adjustment (COLA) — the annual percentage increase to your Social Security benefit to keep up with inflation. The historical average is about 2.5%." />
          </label>
          <div className="flex items-center gap-1">
            <input
              type="range" className="w-20" min={0} max={5} step={0.1}
              value={scenario.socialSecurityCOLA * 100}
              onChange={e => setField('socialSecurityCOLA', parseFloat(e.target.value) / 100)}
            />
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 w-10 text-right">
              {(scenario.socialSecurityCOLA * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Spouse Social Security */}
      {scenario.spouse?.enabled && (
        <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Spouse Social Security</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="input-label">Monthly Benefit</label>
              {isAuto ? (
                <div className="input-field bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-default pl-6">
                  ${estimatedSpouseSS.toLocaleString()}
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={scenario.spouse.socialSecurityBenefit} onChange={v => setField('spouse.socialSecurityBenefit', v)} />
                </div>
              )}
            </div>
            <div>
              <label className="input-label">Claim Age</label>
              <input type="number" className="input-field text-center" value={scenario.spouse.socialSecurityClaimAge} min={62} max={70} onChange={e => setField('spouse.socialSecurityClaimAge', parseInt(e.target.value) || 67)} />
            </div>
          </div>
          {isAuto && (
            <p className="text-[10px] text-gray-400 italic">
              {scenario.spouse.currentSalary > 0
                ? `Estimated from $${(scenario.spouse.currentSalary * 12).toLocaleString()}/yr salary`
                : `Spousal benefit: 50% of your $${estimatedSS.toLocaleString()}/mo Social Security benefit`}
            </p>
          )}
        </div>
      )}

      {/* Your Pension */}
      <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {scenario.spouse?.enabled ? 'Your Pension' : 'Pension'}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="input-label">Monthly Amount</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <CurrencyInput value={scenario.pensionAmount} onChange={v => setField('pensionAmount', v)} />
            </div>
          </div>
          <div>
            <label className="input-label">Start Age</label>
            <input type="number" className={`input-field text-center ${fieldErrorClass(ve, 'pensionStartAge')}`} value={scenario.pensionStartAge} onChange={e => setField('pensionStartAge', parseInt(e.target.value) || 65)} />
            <FieldError errors={ve} field="pensionStartAge" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="input-label mb-0">Yearly Increase</label>
          <div className="flex items-center gap-1">
            <input
              type="range" className="w-20" min={0} max={5} step={0.1}
              value={scenario.pensionCOLA * 100}
              onChange={e => setField('pensionCOLA', parseFloat(e.target.value) / 100)}
            />
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 w-10 text-right">
              {(scenario.pensionCOLA * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Spouse Pension */}
      {scenario.spouse?.enabled && (
        <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Spouse Pension</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="input-label">Monthly Amount</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <CurrencyInput value={scenario.spouse.pensionAmount} onChange={v => setField('spouse.pensionAmount', v)} />
              </div>
            </div>
            <div>
              <label className="input-label">Start Age</label>
              <input type="number" className={`input-field text-center ${fieldErrorClass(ve, 'spouse.pensionStartAge')}`} value={scenario.spouse.pensionStartAge} onChange={e => setField('spouse.pensionStartAge', parseInt(e.target.value) || 65)} />
              <FieldError errors={ve} field="spouse.pensionStartAge" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="input-label mb-0">Yearly Increase</label>
            <div className="flex items-center gap-1">
              <input
                type="range" className="w-20" min={0} max={5} step={0.1}
                value={scenario.spouse.pensionCOLA * 100}
                onChange={e => setField('spouse.pensionCOLA', parseFloat(e.target.value) / 100)}
              />
              <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 w-10 text-right">
                {(scenario.spouse.pensionCOLA * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Other Income */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Other Income</label>
          <button className="text-xs text-primary-600 dark:text-primary-400 hover:underline" onClick={addOtherIncome}>
            + Add
          </button>
        </div>
        {scenario.otherIncomeSources.map(src => (
          <div key={src.id} className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs space-y-1">
            <div className="flex gap-1">
              <input className="input-field flex-1" value={src.name} onChange={e => updateOtherIncome(src.id, 'name', e.target.value)} />
              <button className="text-red-400 hover:text-red-600 px-1" onClick={() => removeOtherIncome(src.id)}>✕</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <div>
                <label className="input-label">$/mo</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={src.annualAmount as number} onChange={v => updateOtherIncome(src.id, 'annualAmount', v)} />
                </div>
              </div>
              <div>
                <label className="input-label">Start</label>
                <input type="number" className={`input-field ${fieldErrorClass(ve, `otherIncome.${src.id}`)}`} value={src.startAge} onChange={e => updateOtherIncome(src.id, 'startAge', parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label className="input-label">End</label>
                <input type="number" className={`input-field ${fieldErrorClass(ve, `otherIncome.${src.id}`)}`} value={src.endAge} onChange={e => updateOtherIncome(src.id, 'endAge', parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <FieldError errors={ve} field={`otherIncome.${src.id}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
