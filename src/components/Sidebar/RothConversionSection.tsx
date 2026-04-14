import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { RothConversionStrategy } from '../../types';

const BRACKET_OPTIONS = [
  { rate: 0.10, label: '10%' },
  { rate: 0.12, label: '12%' },
  { rate: 0.22, label: '22%' },
  { rate: 0.24, label: '24%' },
  { rate: 0.32, label: '32%' },
  { rate: 0.35, label: '35%' },
];

export function RothConversionSection() {
  const { scenario, setField } = useScenario();
  const rc = scenario.rothConversion;

  return (
    <div className="space-y-3">
      <h3 className="section-title">Roth Conversions</h3>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={rc.enabled}
          onChange={e => setField('rothConversion.enabled', e.target.checked)}
        />
        Enable Roth conversion strategy
      </label>

      {rc.enabled && (
        <>
          <div>
            <label className="input-label">Strategy</label>
            <select
              className="input-field"
              value={rc.strategy}
              onChange={e => setField('rothConversion.strategy', e.target.value as RothConversionStrategy)}
            >
              <option value="fillBracket">Fill to Tax Bracket</option>
              <option value="fixedAmount">Fixed Annual Amount</option>
            </select>
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
                  <option key={b.rate} value={b.rate}>
                    Fill to top of {b.label} bracket
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Convert enough each year to fill taxable income up to the top of this bracket.
                Bracket thresholds are inflation-indexed.
              </p>
            </div>
          ) : (
            <div>
              <label className="input-label">Annual Conversion Amount ($)</label>
              <input
                type="number"
                className="input-field"
                value={rc.fixedAnnualAmount}
                onChange={e => setField('rothConversion.fixedAnnualAmount', parseFloat(e.target.value) || 0)}
              />
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="input-label">Start Age</label>
              <input
                type="number"
                className="input-field"
                value={rc.startAge}
                onChange={e => setField('rothConversion.startAge', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1">
              <label className="input-label">End Age</label>
              <input
                type="number"
                className="input-field"
                value={rc.endAge}
                onChange={e => setField('rothConversion.endAge', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400">
            Typically retirement age through age 72 (before RMDs begin at 73).
            Converts from Traditional 401(k)/IRA → Roth IRA.
          </p>
        </>
      )}
    </div>
  );
}
