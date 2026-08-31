import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput, AccountAllocations } from '../types';
import { ACCOUNT_TYPES } from '../types';

/**
 * Pension lump-sum tests. Uses a 100%-cash / 0%-return portfolio so balance
 * arithmetic is exact: the deposit is the only thing that moves the account.
 */

const ALL_CASH: AccountAllocations = Object.fromEntries(
  ACCOUNT_TYPES.map(a => [a, { stocks: 0, bonds: 0, cash: 100, crypto: 0 }]),
) as AccountAllocations;

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    socialSecurityMode: 'manual',
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 90,
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
    currentAge: 60, retirementAge: 60, endAge: 70,
    baseMonthlySpending: 2000, // monthly → $24k/yr, funded from cashAccount
    pensionType: 'lumpSum',
    pensionAmount: 200_000,   // lump sum — NOT annualized
    pensionStartAge: 65,
    balances: {
      traditional401k: 0, roth401k: 0, traditionalIRA: 0, rothIRA: 0,
      taxable: 0, hsa: 0, cashAccount: 500_000, otherAssets: 0,
    },
    ...overrides,
  };
}

describe('Pension lump sum', () => {
  it('IRA rollover: deposits at start age, no recurring income, no immediate tax', () => {
    const result = runSimulation(makeScenario(), { numSimulations: 1, seed: 42 });

    for (const yr of result.medianPath) {
      // Never paid as recurring income
      expect(yr.income.pension).toBe(0);
      if (yr.age < 65) {
        expect(yr.balances.traditionalIRA).toBe(0);
      } else {
        // Deposited once at 65; spending is drawn from cash first, and with
        // 0% returns the IRA sits at exactly the rollover amount.
        expect(yr.balances.traditionalIRA).toBeCloseTo(200_000, 0);
      }
      // Rollover is not a taxable event (spending comes from cash → no tax)
      expect(yr.taxes.total).toBeCloseTo(0, 0);
    }
  });

  it('cash-out to taxable: deposits at start age and is taxed as ordinary income', () => {
    const scenario = makeScenario({ pensionLumpSumAccount: 'taxable' });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    const depositYear = result.medianPath.find(y => y.age === 65)!;
    const before = result.medianPath.find(y => y.age === 64)!;

    expect(before.balances.taxable).toBe(0);
    expect(depositYear.balances.taxable).toBeCloseTo(200_000, 0);
    // $200k ordinary income (HOH) → substantial federal tax that year only
    expect(depositYear.taxes.federal).toBeGreaterThan(25_000);
    const after = result.medianPath.find(y => y.age === 66)!;
    expect(after.taxes.federal).toBeCloseTo(0, 0);
  });

  it('cash-out proceeds carry full cost basis (no capital gains on later withdrawal)', () => {
    // Drain cash before 65 so post-deposit spending comes from taxable
    const scenario = makeScenario({
      pensionLumpSumAccount: 'taxable',
      balances: { ...makeScenario().balances, cashAccount: 130_000 }, // ~5 yrs spending + deposit-year tax
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    for (const yr of result.medianPath) {
      if (yr.age > 65 && yr.withdrawals.taxable > 0) {
        // Basis equals the deposit → zero realized gains → zero LTCG tax
        expect(yr.taxes.capitalGains).toBeCloseTo(0, 0);
      }
    }
  });

  it('annuity type still pays recurring income and never deposits a lump sum', () => {
    const scenario = makeScenario({
      pensionType: 'annuity',
      pensionAmount: 1000, // monthly → $12k/yr
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    for (const yr of result.medianPath) {
      expect(yr.balances.traditionalIRA).toBe(0);
      if (yr.age >= 65) {
        expect(yr.income.pension).toBeCloseTo(12_000, 0);
      } else {
        expect(yr.income.pension).toBe(0);
      }
    }
  });
});
