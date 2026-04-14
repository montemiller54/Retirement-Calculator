import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { WITHDRAWAL_STRATEGY_LABELS, type WithdrawalStrategy } from '../../types';

const STRATEGIES: WithdrawalStrategy[] = ['taxEfficient', 'rothPreserving', 'proRata'];

export function WithdrawalSection() {
  const { scenario, setField } = useScenario();

  return (
    <div className="space-y-3">
      <h3 className="section-title">Withdrawal Strategy</h3>
      <div className="space-y-1">
        {STRATEGIES.map(s => (
          <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name="withdrawalStrategy"
              checked={scenario.withdrawalStrategy === s}
              onChange={() => setField('withdrawalStrategy', s)}
              className="accent-primary-600"
            />
            {WITHDRAWAL_STRATEGY_LABELS[s]}
          </label>
        ))}
      </div>
      <p className="text-[10px] text-gray-400">
        {scenario.withdrawalStrategy === 'taxEfficient' && 'Taxable → Pre-tax (with RMDs) → Roth'}
        {scenario.withdrawalStrategy === 'rothPreserving' && 'Taxable → Pre-tax first to preserve Roth'}
        {scenario.withdrawalStrategy === 'proRata' && 'Withdraw proportionally from all accounts'}
      </p>
    </div>
  );
}
