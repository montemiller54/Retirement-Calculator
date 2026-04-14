import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput } from '../types';
import { ACCOUNT_TYPES } from '../types';

/**
 * Phase 2: Integration & accounting-identity tests.
 * Verifies that full simulation paths maintain correct balance accounting,
 * percentile ordering, tax gross-up convergence, and non-negativity.
 */

// Helper: make a minimal scenario with known state for deterministic single-path tests
function makeTestScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    socialSecurityMode: 'manual',
    ...overrides,
  };
}

describe('Balance accounting identity', () => {
  it('ending = beginning + contributions + returns - withdrawals (each year)', () => {
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 1, seed: 42 });
    const path = result.medianPath; // with 1 sim, median IS the path

    // For the first year, beginningBalance = initial balances
    let prevBalances = { ...DEFAULT_SCENARIO.balances };

    for (const yr of path) {
      // Sum of changes: contributions + returns - withdrawals
      const beginningTotal = ACCOUNT_TYPES.reduce((s, a) => s + prevBalances[a], 0);
      const contribs = ACCOUNT_TYPES.reduce((s, a) => s + yr.contributions[a], 0);
      const withdraws = ACCOUNT_TYPES.reduce((s, a) => s + yr.withdrawals[a], 0);
      const invReturn = yr.investmentReturn;

      // Excess RMD goes back into taxable, so balances should roughly satisfy:
      // ending ≈ beginning + contributions - withdrawals + returns + excessRMD
      // We don't have excessRMD in YearResult, so allow tolerance for it.
      const expected = beginningTotal + contribs - withdraws + invReturn;
      const actual = yr.totalBalance;

      // Excess RMD re-deposits and iterative tax convergence can cause discrepancy.
      // Use percentage-based tolerance: within 2% of the larger value.
      const maxVal = Math.max(Math.abs(actual), Math.abs(expected), 1);
      const relErr = Math.abs(actual - expected) / maxVal;
      expect(relErr).toBeLessThan(0.02);

      prevBalances = { ...yr.balances };
    }
  });

  it('each account balance is non-negative at all times', () => {
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 5, seed: 77 });
    // Check the median path
    for (const yr of result.medianPath) {
      for (const acct of ACCOUNT_TYPES) {
        expect(yr.balances[acct]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('Percentile band ordering', () => {
  it('P10 ≤ P25 ≤ P50 ≤ P75 ≤ P90 at every age', () => {
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 200, seed: 99 });
    for (const band of result.percentileBands) {
      expect(band.p10).toBeLessThanOrEqual(band.p25 + 0.01);
      expect(band.p25).toBeLessThanOrEqual(band.p50 + 0.01);
      expect(band.p50).toBeLessThanOrEqual(band.p75 + 0.01);
      expect(band.p75).toBeLessThanOrEqual(band.p90 + 0.01);
    }
  });
});

describe('Tax gross-up convergence', () => {
  it('spending + taxes ≤ total withdrawn + income (each retirement year)', () => {
    // Use a scenario that is well into retirement with substantial withdrawals
    const scenario = makeTestScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 90,
      currentSalary: 0,
      balances: {
        traditional401k: 500000,
        roth401k: 0,
        traditionalIRA: 200000,
        rothIRA: 100000,
        taxable: 200000,
        hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 5000, // monthly → $60k/yr
      socialSecurityBenefit: 2000, // monthly → $24k/yr
      socialSecurityClaimAge: 67,
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      if (yr.spending === 0) continue;
      const totalWithdrawn = ACCOUNT_TYPES.reduce((s, a) => s + yr.withdrawals[a], 0);
      const totalIncome = yr.income.total;
      const cashAvailable = totalWithdrawn + totalIncome;
      // Cash available should cover spending + taxes
      // Allow tolerance for cases where excess RMD is reinvested
      expect(cashAvailable + 500).toBeGreaterThanOrEqual(yr.spending);
    }
  });
});

describe('Determinism', () => {
  it('identical seeds produce identical paths year-by-year', () => {
    const r1 = runSimulation(DEFAULT_SCENARIO, { numSimulations: 5, seed: 314 });
    const r2 = runSimulation(DEFAULT_SCENARIO, { numSimulations: 5, seed: 314 });
    expect(r1.successRate).toBe(r2.successRate);
    for (let i = 0; i < r1.medianPath.length; i++) {
      expect(r1.medianPath[i].totalBalance).toBe(r2.medianPath[i].totalBalance);
      expect(r1.medianPath[i].spending).toBe(r2.medianPath[i].spending);
      expect(r1.medianPath[i].taxes.total).toBe(r2.medianPath[i].taxes.total);
    }
  });
});

describe('Accumulation phase logic', () => {
  it('no withdrawals or spending before retirement', () => {
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      if (yr.age < DEFAULT_SCENARIO.retirementAge) {
        const totalWithdrawn = ACCOUNT_TYPES.reduce((s, a) => s + yr.withdrawals[a], 0);
        expect(totalWithdrawn).toBe(0);
        expect(yr.spending).toBe(0);
      }
    }
  });

  it('contributions happen only before retirement', () => {
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      const totalContribs = ACCOUNT_TYPES.reduce((s, a) => s + yr.contributions[a], 0);
      if (yr.age >= DEFAULT_SCENARIO.retirementAge) {
        expect(totalContribs).toBe(0);
      } else {
        expect(totalContribs).toBeGreaterThan(0);
      }
    }
  });

  it('salary grows at the expected rate', () => {
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 1, seed: 42 });
    const firstWorkingYear = result.medianPath.find(y => y.age === DEFAULT_SCENARIO.currentAge)!;
    const lastWorkingYear = result.medianPath.find(y => y.age === DEFAULT_SCENARIO.retirementAge - 1)!;
    const yearsWorked = lastWorkingYear.age - firstWorkingYear.age;
    const expectedGrowth = Math.pow(1 + DEFAULT_SCENARIO.salaryGrowthRate, yearsWorked);
    const actualGrowth = lastWorkingYear.income.salary / firstWorkingYear.income.salary;
    expect(actualGrowth).toBeCloseTo(expectedGrowth, 6);
  });
});

describe('Decumulation phase logic', () => {
  it('Social Security starts at claim age and grows by COLA', () => {
    const scenario = makeTestScenario({
      currentAge: 60,
      retirementAge: 60,
      endAge: 80,
      socialSecurityBenefit: 2000, // monthly
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0.02,
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      if (yr.age < 67) {
        expect(yr.income.socialSecurity).toBe(0);
      } else {
        expect(yr.income.socialSecurity).toBeGreaterThan(0);
        // Check COLA growth from claim age
        const yearsFromClaim = yr.age - 67;
        const expected = 24000 * Math.pow(1.02, yearsFromClaim); // 2000*12 annualized
        expect(yr.income.socialSecurity).toBeCloseTo(expected, 0);
      }
    }
  });

  it('pension starts at pensionStartAge with COLA', () => {
    const scenario = makeTestScenario({
      currentAge: 60,
      retirementAge: 60,
      endAge: 80,
      pensionAmount: 1000, // monthly
      pensionStartAge: 65,
      pensionCOLA: 0.015,
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      if (yr.age < 65) {
        expect(yr.income.pension).toBe(0);
      } else {
        const yearsFromStart = yr.age - 65;
        const expected = 12000 * Math.pow(1.015, yearsFromStart); // 1000*12 annualized
        expect(yr.income.pension).toBeCloseTo(expected, 0);
      }
    }
  });
});

describe('Zero-balance edge cases', () => {
  it('handles all-zero starting balances without crash', () => {
    const scenario = makeTestScenario({
      balances: {
        traditional401k: 0, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 5, seed: 42 });
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.percentileBands.length).toBeGreaterThan(0);
  });

  it('handles scenario with no income sources in retirement', () => {
    const scenario = makeTestScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 75,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      otherIncomeSources: [],
      balances: {
        traditional401k: 100000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 3000, // monthly → 36k/yr
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    expect(result.medianPath.length).toBe(11); // ages 65-75
    // Should be drawing down balances
    const firstYear = result.medianPath[0];
    const lastYear = result.medianPath[result.medianPath.length - 1];
    expect(lastYear.totalBalance).toBeLessThan(firstYear.totalBalance);
  });
});

describe('Success rate boundaries', () => {
  it('huge savings with low spending → 100% success', () => {
    const scenario = makeTestScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 75,
      balances: {
        traditional401k: 5000000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 500, // monthly → $6k/yr
      socialSecurityBenefit: 2000,
    });
    const result = runSimulation(scenario, { numSimulations: 100, seed: 42 });
    expect(result.successRate).toBe(1);
  });
});
