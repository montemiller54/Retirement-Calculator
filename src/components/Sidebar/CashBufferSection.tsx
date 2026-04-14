import React from 'react';
import { useScenario } from '../../context/ScenarioContext';

export function CashBufferSection() {
  const { scenario, setField } = useScenario();
  const cb = scenario.cashBuffer;

  return (
    <div className="space-y-3">
      <h3 className="section-title flex items-center gap-2">
        Cash Buffer
        <label className="flex items-center gap-1 text-xs font-normal">
          <input
            type="checkbox"
            checked={cb.enabled}
            onChange={e => setField('cashBuffer.enabled', e.target.checked)}
            className="accent-primary-600"
          />
          Enable
        </label>
      </h3>

      {cb.enabled && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400">
            Keep a cash reserve to avoid selling investments in down markets.
            Refills automatically when markets are up.
          </p>

          <label className="flex items-center justify-between text-xs">
            <span>Years of expenses</span>
            <input
              type="number"
              className="input-field w-16 text-center"
              min={1}
              max={5}
              step={1}
              value={cb.yearsOfExpenses}
              onChange={e => setField('cashBuffer.yearsOfExpenses', Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
            />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={cb.refillInUpMarkets}
              onChange={e => setField('cashBuffer.refillInUpMarkets', e.target.checked)}
              className="accent-primary-600"
            />
            Refill buffer in up markets
          </label>
        </div>
      )}
    </div>
  );
}
