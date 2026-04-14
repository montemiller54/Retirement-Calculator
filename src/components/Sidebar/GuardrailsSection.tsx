import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { GuardrailTier } from '../../types';

export function GuardrailsSection() {
  const { scenario, setField } = useScenario();
  const g = scenario.guardrails;

  const addTier = () => {
    const newTier: GuardrailTier = { drawdownPct: 20, spendingCutPct: 10 };
    setField('guardrails.tiers', [...g.tiers, newTier]);
  };

  const removeTier = (idx: number) => {
    setField('guardrails.tiers', g.tiers.filter((_, i) => i !== idx));
  };

  const updateTier = (idx: number, field: keyof GuardrailTier, value: number) => {
    setField(
      'guardrails.tiers',
      g.tiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="section-title flex items-center gap-2">
        Guardrails
        <label className="flex items-center gap-1 text-xs font-normal">
          <input
            type="checkbox"
            checked={g.enabled}
            onChange={e => setField('guardrails.enabled', e.target.checked)}
            className="accent-primary-600"
          />
          Enable
        </label>
      </h3>

      {g.enabled && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400">
            Cut spending when portfolio drops from high-water mark.
          </p>

          {g.tiers.map((tier, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span>If ≥</span>
              <input
                type="number"
                className="input-field w-14 text-center"
                value={tier.drawdownPct}
                onChange={e => updateTier(idx, 'drawdownPct', parseFloat(e.target.value) || 0)}
              />
              <span>% drop → cut</span>
              <input
                type="number"
                className="input-field w-14 text-center"
                value={tier.spendingCutPct}
                onChange={e => updateTier(idx, 'spendingCutPct', parseFloat(e.target.value) || 0)}
              />
              <span>%</span>
              {g.tiers.length > 1 && (
                <button
                  className="text-red-400 hover:text-red-600"
                  onClick={() => removeTier(idx)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <button
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            onClick={addTier}
          >
            + Add tier
          </button>

          <div>
            <label className="input-label">Minimum Monthly Spending Floor ($)</label>
            <input
              type="number"
              className="input-field w-28"
              value={g.minimumSpendingFloor}
              onChange={e => setField('guardrails.minimumSpendingFloor', parseFloat(e.target.value) || 0)}
            />
            <p className="text-[10px] text-gray-400">0 = no floor</p>
          </div>
        </div>
      )}
    </div>
  );
}
