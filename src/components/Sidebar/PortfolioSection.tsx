import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { ACCOUNT_TYPES, ACCOUNT_LABELS } from '../../types';

export function PortfolioSection() {
  const { scenario, setField } = useScenario();

  return (
    <div className="space-y-3">
      <h3 className="section-title">Current Portfolio</h3>

      <div className="space-y-1">
        {ACCOUNT_TYPES.map(acct => (
          <div key={acct} className="flex items-center gap-2">
            <span className="text-xs w-28 truncate" title={ACCOUNT_LABELS[acct]}>
              {ACCOUNT_LABELS[acct]}
            </span>
            <span className="text-xs text-gray-400">$</span>
            <input
              type="number"
              className="input-field flex-1 text-right"
              value={scenario.balances[acct]}
              onChange={e =>
                setField(`balances.${acct}`, parseFloat(e.target.value) || 0)
              }
            />
          </div>
        ))}
      </div>

      <div>
        <label className="input-label">Taxable Cost Basis (%)</label>
        <input
          type="number"
          className="input-field w-20"
          min={0}
          max={100}
          step={1}
          value={(scenario.taxableCostBasisPct * 100).toFixed(0)}
          onChange={e => setField('taxableCostBasisPct', (parseFloat(e.target.value) || 0) / 100)}
        />
        <p className="text-[10px] text-gray-400 mt-0.5">Percentage of taxable balance that is original cost basis</p>
      </div>
    </div>
  );
}
