import { describe, it, expect } from 'vitest';
import { calculateRMD } from '../engine/rmd';
import { getRmdStartAge } from '../constants/rmd-table';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput } from '../types';

describe('calculateRMD', () => {
  it('returns 0 for ages below 73', () => {
    expect(calculateRMD(72, 1000000)).toBe(0);
    expect(calculateRMD(60, 500000)).toBe(0);
  });

  it('calculates RMD at age 73', () => {
    const balance = 1000000;
    const rmd = calculateRMD(73, balance);
    // Divisor at 73 = 26.5
    expect(rmd).toBeCloseTo(balance / 26.5, 2);
  });

  it('calculates RMD at age 80', () => {
    const balance = 500000;
    const rmd = calculateRMD(80, balance);
    // Divisor at 80 = 20.2
    expect(rmd).toBeCloseTo(balance / 20.2, 2);
  });

  it('returns 0 for zero balance', () => {
    expect(calculateRMD(75, 0)).toBe(0);
  });

  it('uses last table entry for very old ages', () => {
    const balance = 100000;
    const rmd = calculateRMD(125, balance);
    // Should use age 120 divisor = 2.0
    expect(rmd).toBeCloseTo(balance / 2.0, 2);
  });

  it('respects a start age of 75 (born 1960+)', () => {
    const balance = 1000000;
    expect(calculateRMD(73, balance, 75)).toBe(0);
    expect(calculateRMD(74, balance, 75)).toBe(0);
    expect(calculateRMD(75, balance, 75)).toBeCloseTo(balance / 24.6, 2);
  });
});

describe('getRmdStartAge (SECURE 2.0)', () => {
  it('is 73 for those born 1959 or earlier', () => {
    expect(getRmdStartAge(1959)).toBe(73);
    expect(getRmdStartAge(1950)).toBe(73);
  });

  it('is 75 for those born 1960 or later', () => {
    expect(getRmdStartAge(1960)).toBe(75);
    expect(getRmdStartAge(1975)).toBe(75);
  });
});

describe('RMD start age in simulation (derived from birth year)', () => {
  // Derive currentAge from a fixed birth year so tests stay valid as years pass
  const currentYear = new Date().getFullYear();

  function makeScenario(birthYear: number): ScenarioInput {
    const currentAge = currentYear - birthYear;
    return {
      ...DEFAULT_SCENARIO,
      currentAge,
      retirementAge: currentAge,
      endAge: 80,
      jobs: [] as ScenarioInput['jobs'],
      socialSecurityMode: 'manual',
      socialSecurityBenefit: 0,
      socialSecurityClaimAge: 90,
      pensionAmount: 0,
      baseAnnualSpending: 4000, // forces withdrawals so RMDs are exercised
      spendingInflationRate: 0,
      inflationVolatility: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: {
        traditional401k: 2_000_000, roth401k: 0, traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0,
      },
    };
  }

  it('born ≤1959 → RMDs begin at 73', () => {
    const result = runSimulation(makeScenario(1957), { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      if (yr.age < 73) expect(yr.rmdAmount).toBe(0);
      if (yr.age >= 73) expect(yr.rmdAmount).toBeGreaterThan(0);
    }
  });

  it('born ≥1960 → RMDs begin at 75, not 73', () => {
    const result = runSimulation(makeScenario(1963), { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      if (yr.age < 75) expect(yr.rmdAmount).toBe(0);
      if (yr.age >= 75) expect(yr.rmdAmount).toBeGreaterThan(0);
    }
  });

  it('RMDs are forced even when income fully covers spending', () => {
    // High SS + pension leave zero withdrawal need — the RMD must still be
    // taken (and taxed), with the excess reinvested into taxable.
    const currentAge = currentYear - 1950; // RMD start 73, already past it
    const scenario: ScenarioInput = {
      ...makeScenario(1950),
      currentAge,
      retirementAge: currentAge,
      endAge: currentAge + 8,
      socialSecurityBenefit: 5000,   // monthly → $60k/yr
      socialSecurityClaimAge: currentAge,
      socialSecurityCOLA: 0,
      pensionAmount: 4000,           // monthly → $48k/yr
      pensionStartAge: currentAge,
      baseAnnualSpending: 3000,      // monthly → $36k/yr, fully covered by income
    };
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    const first = result.medianPath[0];
    // Age-76 divisor is 23.7 on the $2M starting balance
    const expectedFirstRMD = 2_000_000 / 23.7;
    expect(first.rmdAmount).toBeCloseTo(expectedFirstRMD, 0);
    expect(first.withdrawals.traditional401k).toBeCloseTo(expectedFirstRMD, 0);

    for (const yr of result.medianPath) {
      expect(yr.rmdAmount).toBeGreaterThan(0);
      expect(yr.withdrawals.traditional401k).toBeGreaterThan(0);
      // RMD is ordinary income → must show up in taxes
      expect(yr.taxes.federal).toBeGreaterThan(0);
    }
  });
});
