import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput } from '../types';

/**
 * Housing / mortgage tests.
 *
 * A fixed-rate mortgage P&I payment is constant in NOMINAL dollars (the UI
 * instructs users to enter P&I only), so it must not be inflated. It is also
 * non-discretionary: guardrail spending cuts cannot reduce it.
 */

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    socialSecurityMode: 'manual',
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 90,
    pensionAmount: 0,
    jobs: [] as ScenarioInput['jobs'],
    inflationVolatility: 0,
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    housing: {
      enabled: true,
      mortgagePayment: 2000, // monthly → $24k/yr fixed P&I
      payoffAge: 70,
      downsizingProceeds: 0,
      downsizingAge: 99,
    },
    balances: {
      traditional401k: 0, roth401k: 0, traditionalIRA: 0, rothIRA: 0,
      taxable: 0, hsa: 0, cashAccount: 2_000_000, otherAssets: 0,
    },
    ...overrides,
  };
}

describe('Mortgage payment', () => {
  it('stays fixed in nominal dollars while base spending inflates', () => {
    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 75,
      baseAnnualSpending: 3000, // $36k/yr, inflating
      spendingInflationRate: 0.025,
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      const n = yr.age - 65;
      const inflatedBase = 36000 * Math.pow(1.025, n);
      const mortgage = yr.age < 70 ? 24000 : 0; // fixed nominal until payoff
      expect(yr.spending).toBeCloseTo(inflatedBase + mortgage, 0);
    }
  });

  it('is not reduced by guardrail spending cuts', () => {
    // All-cash portfolio losing 20%/yr deterministically → guardrail trips
    // from year 2 on. The cut applies to base spending only; the mortgage
    // is contractual and must pass through untouched.
    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 70,
      baseAnnualSpending: 3000, // $36k/yr
      spendingInflationRate: 0,
      guardrails: { enabled: true, tiers: [{ drawdownPct: 15, spendingCutPct: 20 }] },
      investments: {
        ...DEFAULT_SCENARIO.investments,
        preRetirement: Object.fromEntries(
          Object.keys(DEFAULT_SCENARIO.balances).map(a => [a, { stocks: 0, bonds: 0, cash: 100, crypto: 0 }]),
        ) as ScenarioInput['investments']['preRetirement'],
        postRetirement: Object.fromEntries(
          Object.keys(DEFAULT_SCENARIO.balances).map(a => [a, { stocks: 0, bonds: 0, cash: 100, crypto: 0 }]),
        ) as ScenarioInput['investments']['postRetirement'],
        assetClassReturns: {
          ...DEFAULT_SCENARIO.investments.assetClassReturns,
          cash: { mean: -0.20, stdDev: 0 },
        },
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    const year1 = result.medianPath[0];
    // No drawdown yet → full spending + mortgage
    expect(year1.spending).toBeCloseTo(36000 + 24000, 0);

    const year2 = result.medianPath[1];
    // >15% drawdown → 20% cut on base only: 36,000×0.8 + 24,000
    expect(year2.spending).toBeCloseTo(36000 * 0.8 + 24000, 0);
  });

  it('drops off entirely at payoff age', () => {
    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 75,
      baseAnnualSpending: 3000,
      spendingInflationRate: 0,
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      expect(yr.spending).toBeCloseTo(yr.age < 70 ? 60000 : 36000, 0);
    }
  });
});
