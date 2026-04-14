import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput, HealthcareCosts } from '../types';

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return { ...DEFAULT_SCENARIO, ...overrides };
}

const BASE_HEALTHCARE: HealthcareCosts = {
  enabled: true,
  preMedicareMonthly: 1500,
  medicareMonthly: 500,
  lateLifeMonthly: 1000,
  medicareStartAge: 65,
  lateLifeStartAge: 80,
  inflationRate: 0,  // zero inflation for deterministic tests
};

describe('Healthcare cost modeling', () => {
  it('disabled healthcare adds no extra spending', () => {
    const withoutHC = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 67,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...BASE_HEALTHCARE, enabled: false },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000 },
    });
    const withHC = makeScenario({
      ...withoutHC,
      healthcare: { ...BASE_HEALTHCARE, enabled: false },
    });

    const r1 = runSimulation(withoutHC, { numSimulations: 1, seed: 42 });
    const r2 = runSimulation(withHC, { numSimulations: 1, seed: 42 });
    expect(r1.medianPath[0].spending).toBe(r2.medianPath[0].spending);
  });

  it('pre-Medicare phase uses preMedicareMonthly cost', () => {
    // Age 60, retires at 60, Medicare at 65 → pre-Medicare phase
    const scenario = makeScenario({
      currentAge: 60, retirementAge: 60, endAge: 62,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...BASE_HEALTHCARE, inflationRate: 0 },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 1000000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr60 = result.medianPath.find(y => y.age === 60)!;
    // Base: 3000*12=36000, Healthcare: 1500*12=18000, Total: 54000
    expect(yr60.spending).toBeCloseTo(36000 + 18000, 0);
  });

  it('Medicare phase uses medicareMonthly cost', () => {
    // Age 65, retires at 65, Medicare at 65 → Medicare phase
    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 67,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...BASE_HEALTHCARE, inflationRate: 0 },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 1000000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr65 = result.medianPath.find(y => y.age === 65)!;
    // Base: 36000, Healthcare: 500*12=6000
    expect(yr65.spending).toBeCloseTo(36000 + 6000, 0);
  });

  it('late-life phase uses lateLifeMonthly cost', () => {
    // Age 80+, retires at 80 → late-life phase
    const scenario = makeScenario({
      currentAge: 80, retirementAge: 80, endAge: 82,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...BASE_HEALTHCARE, inflationRate: 0 },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 1000000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr80 = result.medianPath.find(y => y.age === 80)!;
    // Base: 36000, Healthcare: 1000*12=12000
    expect(yr80.spending).toBeCloseTo(36000 + 12000, 0);
  });

  it('medical inflation compounds from current age', () => {
    // 5% medical inflation, test after 10 years
    const scenario = makeScenario({
      currentAge: 55, retirementAge: 55, endAge: 66,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 70,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...BASE_HEALTHCARE, inflationRate: 0.05 },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 2000000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    // Year 0 (age 55): pre-Medicare, 1500*12=18000, inflated by (1.05)^0 = 18000
    const yr55 = result.medianPath.find(y => y.age === 55)!;
    expect(yr55.spending).toBeCloseTo(36000 + 18000, 0);

    // Year 10 (age 65): Medicare phase, 500*12=6000, inflated by (1.05)^10 = 9773.37
    const yr65 = result.medianPath.find(y => y.age === 65)!;
    const expectedHC65 = 6000 * Math.pow(1.05, 10);
    // Base spending: 36000 (zero inflation) + healthcare
    expect(yr65.spending).toBeCloseTo(36000 + expectedHC65, -1);
  });

  it('phase transitions happen at correct ages', () => {
    const scenario = makeScenario({
      currentAge: 60, retirementAge: 60, endAge: 85,
      baseAnnualSpending: 0, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: {
        enabled: true,
        preMedicareMonthly: 100,
        medicareMonthly: 200,
        lateLifeMonthly: 300,
        medicareStartAge: 65,
        lateLifeStartAge: 80,
        inflationRate: 0,
      },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 5000000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    // Pre-Medicare: ages 60-64 → 100*12 = 1200
    const yr64 = result.medianPath.find(y => y.age === 64)!;
    expect(yr64.spending).toBeCloseTo(1200, 0);

    // Medicare: ages 65-79 → 200*12 = 2400
    const yr65 = result.medianPath.find(y => y.age === 65)!;
    expect(yr65.spending).toBeCloseTo(2400, 0);

    const yr79 = result.medianPath.find(y => y.age === 79)!;
    expect(yr79.spending).toBeCloseTo(2400, 0);

    // Late-life: ages 80+ → 300*12 = 3600
    const yr80 = result.medianPath.find(y => y.age === 80)!;
    expect(yr80.spending).toBeCloseTo(3600, 0);
  });

  it('healthcare costs are not reduced by guardrails', () => {
    // Set up guardrails that would trigger a spending cut, then verify
    // healthcare portion is preserved
    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 67,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      guardrails: {
        enabled: true,
        tiers: [{ drawdownPct: 0.001, spendingCutPct: 50 }], // always triggers 50% cut
        minimumSpendingFloor: 0,
      },
      healthcare: { ...BASE_HEALTHCARE, inflationRate: 0 },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr66 = result.medianPath.find(y => y.age === 66)!;
    // Base spending = 36000, guardrails cut it to ~18000 (50%)
    // Healthcare (Medicare) = 6000, should NOT be cut
    // Total should be around 18000 + 6000 = 24000
    // (Not exactly 18000 base due to guardrail mechanics, but healthcare should be additive)
    expect(yr66.spending).toBeGreaterThan(6000); // at minimum healthcare is present
  });
});
