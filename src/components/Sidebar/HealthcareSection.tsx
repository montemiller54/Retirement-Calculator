import React from 'react';
import { useScenario } from '../../context/ScenarioContext';

export function HealthcareSection() {
  const { scenario, setField } = useScenario();
  const hc = scenario.healthcare;

  return (
    <div className="space-y-3">
      <h3 className="section-title">Healthcare Costs</h3>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={hc.enabled}
          onChange={e => setField('healthcare.enabled', e.target.checked)}
        />
        Enable healthcare cost modeling
      </label>

      {hc.enabled && (
        <>
          <div>
            <label className="input-label">Pre-Medicare Monthly Cost ($)</label>
            <input
              type="number"
              className="input-field"
              value={hc.preMedicareMonthly}
              onChange={e => setField('healthcare.preMedicareMonthly', parseFloat(e.target.value) || 0)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Retirement to age {hc.medicareStartAge - 1} (ACA / COBRA / private)
            </p>
          </div>

          <div>
            <label className="input-label">Medicare Monthly Cost ($)</label>
            <input
              type="number"
              className="input-field"
              value={hc.medicareMonthly}
              onChange={e => setField('healthcare.medicareMonthly', parseFloat(e.target.value) || 0)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Age {hc.medicareStartAge}–{hc.lateLifeStartAge - 1} (Parts B/D + Medigap)
            </p>
          </div>

          <div>
            <label className="input-label">Late-Life Monthly Cost ($)</label>
            <input
              type="number"
              className="input-field"
              value={hc.lateLifeMonthly}
              onChange={e => setField('healthcare.lateLifeMonthly', parseFloat(e.target.value) || 0)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Age {hc.lateLifeStartAge}+ (increased care / long-term care)
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="input-label">Medicare Start Age</label>
              <input
                type="number"
                className="input-field"
                value={hc.medicareStartAge}
                onChange={e => setField('healthcare.medicareStartAge', parseInt(e.target.value) || 65)}
              />
            </div>
            <div className="flex-1">
              <label className="input-label">Late-Life Start Age</label>
              <input
                type="number"
                className="input-field"
                value={hc.lateLifeStartAge}
                onChange={e => setField('healthcare.lateLifeStartAge', parseInt(e.target.value) || 80)}
              />
            </div>
          </div>

          <div>
            <label className="input-label">Medical Inflation (%)</label>
            <input
              type="number"
              className="input-field w-20"
              step="0.1"
              value={(hc.inflationRate * 100).toFixed(1)}
              onChange={e => setField('healthcare.inflationRate', (parseFloat(e.target.value) || 0) / 100)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Historical medical CPI ≈ 5%. Costs inflate from today's dollars.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
