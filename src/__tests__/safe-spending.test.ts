import { describe, it, expect } from 'vitest';
import { findSafeSpending, runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput, AccountAllocations } from '../types';
import { ACCOUNT_TYPES } from '../types';

/**
 * findSafeSpending tests.
 *
 * The deterministic case uses a 100%-cash portfolio with 0% return and 0%
 * volatility/inflation: every Monte Carlo path is identical, so the safe
 * spending level is simple arithmetic — balance ÷ months of retirement —
 * and the binary search must land on it regardless of seed.
 */

const ALL_CASH: AccountAllocations = Object.fromEntries(
  ACCOUNT_TYPES.map(a => [a, { stocks: 0, bonds: 0, cash: 100, crypto: 0 }]),
) as AccountAllocations;

function makeDeterministicScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    socialSecurityMode: 'manual',
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 90,
    pensionAmount: 0,
    jobs: [] as ScenarioInput['jobs'],
    spendingInflationRate: 0,
    inflationVolatility: 0,
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    investments: {
      ...DEFAULT_SCENARIO.investments,
      preRetirement: ALL_CASH,
      postRetirement: ALL_CASH,
      assetClassReturns: {
        ...DEFAULT_SCENARIO.investments.assetClassReturns,
        cash: { mean: 0, stdDev: 0 },
      },
    },
    balances: {
      traditional401k: 0, roth401k: 0, traditionalIRA: 0, rothIRA: 0,
      taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0,
    },
    ...overrides,
  };
}

describe('findSafeSpending', () => {
  it('deterministic 0%-return portfolio → safe spending is balance ÷ months', () => {
    // Ages 65..75 inclusive = 11 spending years, $264k cash, no taxes on
    // cash-account withdrawals → sustainable = 264000 / 11 / 12 = $2,000/mo.
    const scenario = makeDeterministicScenario({
      currentAge: 65, retirementAge: 65, endAge: 75,
      baseMonthlySpending: 2000,
      balances: { ...makeDeterministicScenario().balances, cashAccount: 264_000 },
    });

    const result = findSafeSpending(scenario, 0.90);

    // Binary search tolerance is $25/mo; the engine also keeps a ~$100
    // year-end buffer above its depletion threshold.
    expect(result.monthlySpending).toBeGreaterThan(1900);
    expect(result.monthlySpending).toBeLessThanOrEqual(2000);
    expect(result.annualSpending).toBe(result.monthlySpending * 12);
    // Every path is identical, so the found level must actually succeed
    expect(result.achievedSuccessRate).toBe(1);
  });

  it('achieved success rate meets the target within Monte Carlo noise', () => {
    const scenario: ScenarioInput = {
      ...DEFAULT_SCENARIO,
      socialSecurityMode: 'manual',
      currentAge: 60, retirementAge: 60, endAge: 75,
      jobs: [] as ScenarioInput['jobs'],
      socialSecurityBenefit: 1500, socialSecurityClaimAge: 67,
      pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: {
        ...DEFAULT_SCENARIO.balances,
        traditional401k: 800_000, roth401k: 0, taxable: 200_000,
      },
    };

    const result = findSafeSpending(scenario, 0.90);

    expect(result.monthlySpending).toBeGreaterThan(0);
    expect(result.targetSuccessRate).toBe(0.90);
    // 'low' bound is conservative at 2000 search sims; allow small MC drift
    // between the search runs and the 5000-sim final run.
    expect(result.achievedSuccessRate).toBeGreaterThanOrEqual(0.87);

    // Cross-check: simulating at the found spending level reproduces
    // roughly the achieved rate (independent seed).
    const check = runSimulation(
      { ...scenario, baseMonthlySpending: result.monthlySpending },
      { numSimulations: 2000, seed: 4242 },
    );
    expect(check.successRate).toBeGreaterThanOrEqual(0.85);
  });
});
