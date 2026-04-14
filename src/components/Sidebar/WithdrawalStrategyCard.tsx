import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { WITHDRAWAL_STRATEGY_LABELS, type WithdrawalStrategy, type RothConversionStrategy, type GuardrailTier } from '../../types';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';

const STRATEGIES: WithdrawalStrategy[] = ['taxEfficient', 'rothPreserving', 'proRata'];

const BRACKET_OPTIONS = [
  { rate: 0.10, label: '10%' },
  { rate: 0.12, label: '12%' },
  { rate: 0.22, label: '22%' },
  { rate: 0.24, label: '24%' },
  { rate: 0.32, label: '32%' },
  { rate: 0.35, label: '35%' },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`relative inline-flex w-9 h-5 rounded-full border transition-colors ${checked ? 'bg-primary-500 border-primary-500' : 'bg-gray-300 border-gray-300 dark:bg-gray-500 dark:border-gray-400'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

export function WithdrawalStrategyCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const rc = scenario.rothConversion;
  const g = scenario.guardrails;
  const cb = scenario.cashBuffer;

  const addTier = () => {
    const newTier: GuardrailTier = { drawdownPct: 20, spendingCutPct: 10 };
    setField('guardrails.tiers', [...g.tiers, newTier]);
  };

  const removeTier = (idx: number) => {
    setField('guardrails.tiers', g.tiers.filter((_: GuardrailTier, i: number) => i !== idx));
  };

  const updateTier = (idx: number, field: keyof GuardrailTier, value: number) => {
    setField(
      'guardrails.tiers',
      g.tiers.map((t: GuardrailTier, i: number) => (i === idx ? { ...t, [field]: value } : t)),
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-400 mb-1">How you draw down your portfolio in retirement.</p>

      {/* Withdrawal order */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Withdrawal Order</label>
        <div className="flex gap-1">
          {STRATEGIES.map(s => (
            <button
              key={s}
              className={`flex-1 text-[11px] py-1.5 rounded border ${
                scenario.withdrawalStrategy === s
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              onClick={() => setField('withdrawalStrategy', s)}
            >
              {WITHDRAWAL_STRATEGY_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400">
          {scenario.withdrawalStrategy === 'taxEfficient' && 'Taxable → Pre-tax (with RMDs) → Roth'}
          {scenario.withdrawalStrategy === 'rothPreserving' && 'Taxable → Pre-tax first to preserve Roth'}
          {scenario.withdrawalStrategy === 'proRata' && 'Withdraw proportionally from all accounts'}
        </p>
      </div>

      {/* Roth Conversions */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <Toggle
          checked={rc.enabled}
          onChange={v => setField('rothConversion.enabled', v)}
          label="Roth Conversions"
        />

        {rc.enabled && (
          <div className="space-y-2">
            <div className="flex gap-1">
              {(['fillBracket', 'fixedAmount'] as RothConversionStrategy[]).map(s => (
                <button
                  key={s}
                  className={`flex-1 text-[11px] py-1 rounded border ${
                    rc.strategy === s
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={() => setField('rothConversion.strategy', s)}
                >
                  {s === 'fillBracket' ? 'Fill Bracket' : 'Fixed Amount'}
                </button>
              ))}
            </div>

            {rc.strategy === 'fillBracket' ? (
              <div>
                <label className="input-label">Target Bracket</label>
                <select
                  className="input-field"
                  value={rc.targetBracketRate}
                  onChange={e => setField('rothConversion.targetBracketRate', parseFloat(e.target.value))}
                >
                  {BRACKET_OPTIONS.map(b => (
                    <option key={b.rate} value={b.rate}>Fill to top of {b.label} bracket</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="input-label">Annual Amount</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <CurrencyInput value={rc.fixedAnnualAmount} onChange={v => setField('rothConversion.fixedAnnualAmount', v)} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="input-label">Start Age</label>
                <input type="number" className={`input-field text-center ${fieldErrorClass(ve, 'rothConversion.startAge')}`} value={rc.startAge} onChange={e => setField('rothConversion.startAge', parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label className="input-label">End Age</label>
                <input type="number" className={`input-field text-center ${fieldErrorClass(ve, 'rothConversion.startAge')}`} value={rc.endAge} onChange={e => setField('rothConversion.endAge', parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <FieldError errors={ve} field="rothConversion.startAge" />
            <p className="text-[10px] text-gray-400">Typically retirement through age 72 (before RMDs at 73).</p>
          </div>
        )}
      </div>

      {/* Guardrails */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <Toggle
          checked={g.enabled}
          onChange={v => setField('guardrails.enabled', v)}
          label="Spending Guardrails"
        />

        {g.enabled && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-400">Cut spending when portfolio drops from high-water mark.</p>

            {g.tiers.map((tier: GuardrailTier, idx: number) => (
              <div key={idx}>
                <div className="flex items-center gap-1.5 text-xs">
                  <span>If ≥</span>
                  <input type="number" className={`input-field w-12 text-center ${fieldErrorClass(ve, `guardrails.tiers.${idx}.drawdownPct`)}`} value={tier.drawdownPct} onChange={e => updateTier(idx, 'drawdownPct', parseFloat(e.target.value) || 0)} />
                  <span>% drop → cut</span>
                  <input type="number" className={`input-field w-12 text-center ${fieldErrorClass(ve, `guardrails.tiers.${idx}.spendingCutPct`)}`} value={tier.spendingCutPct} onChange={e => updateTier(idx, 'spendingCutPct', parseFloat(e.target.value) || 0)} />
                  <span>%</span>
                  {g.tiers.length > 1 && (
                    <button className="text-red-400 hover:text-red-600" onClick={() => removeTier(idx)}>✕</button>
                  )}
                </div>
                <FieldError errors={ve} field={`guardrails.tiers.${idx}.drawdownPct`} />
                <FieldError errors={ve} field={`guardrails.tiers.${idx}.spendingCutPct`} />
              </div>
            ))}

            <button className="text-xs text-primary-600 dark:text-primary-400 hover:underline" onClick={addTier}>+ Add tier</button>

            <div>
              <label className="input-label">Min Monthly Spending Floor</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <CurrencyInput className="w-28" value={g.minimumSpendingFloor} onChange={v => setField('guardrails.minimumSpendingFloor', v)} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">0 = no floor</p>
            </div>
          </div>
        )}
      </div>

      {/* Cash Buffer */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <Toggle
          checked={cb.enabled}
          onChange={v => setField('cashBuffer.enabled', v)}
          label="Cash Buffer"
        />

        {cb.enabled && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-400">Keep cash reserve to avoid selling in down markets.</p>

            <div className="flex items-center justify-between text-xs">
              <span>Years of expenses</span>
              <div className="flex items-center gap-1">
                <input
                  type="range" className="w-20 h-1.5 accent-primary-600" min={1} max={5} step={1}
                  value={cb.yearsOfExpenses}
                  onChange={e => setField('cashBuffer.yearsOfExpenses', parseInt(e.target.value))}
                />
                <span className="font-semibold text-primary-600 dark:text-primary-400 w-4 text-right">{cb.yearsOfExpenses}</span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={cb.refillInUpMarkets} onChange={e => setField('cashBuffer.refillInUpMarkets', e.target.checked)} className="accent-primary-600" />
              Refill buffer in up markets
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
