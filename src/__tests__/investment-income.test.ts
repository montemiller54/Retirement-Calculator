import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput, AccountAllocations, AssetAllocation } from '../types';
import { ACCOUNT_TYPES } from '../types';

/**
 * Taxable-account investment income (dividend/interest tax drag).
 *
 * The taxable brokerage account distributes dividends and interest every year,
 * taxed currently: qualified dividends (stock portion, LTCG rates) and
 * interest (bond/cash portion, ordinary rates). Distributions are reinvested,
 * so they add to cost basis. Other account types have no annual tax drag.
 */

function allocations(taxableAlloc: AssetAllocation): AccountAllocations {
  const cashOnly: AssetAllocation = { stocks: 0, bonds: 0, cash: 100, crypto: 0 };
  const out = Object.fromEntries(
    ACCOUNT_TYPES.map(a => [a, a === 'taxable' ? { ...taxableAlloc } : cashOnly]),
  ) as AccountAllocations;
  return out;
}

function makeScenario(
  taxableAlloc: AssetAllocation,
  overrides: Partial<ScenarioInput> = {},
): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    socialSecurityMode: 'manual',
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 90,
    pensionAmount: 0,
    jobs: [] as ScenarioInput['jobs'],
    filingStatus: 'single',
    stateCode: 'TX',
    currentAge: 65, retirementAge: 65, endAge: 75,
    baseAnnualSpending: 2000, // monthly → $24k/yr
    spendingInflationRate: 0,
    inflationVolatility: 0,
    taxableCostBasisPct: 1.0,
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    investments: {
      ...DEFAULT_SCENARIO.investments,
      preRetirement: allocations(taxableAlloc),
      postRetirement: allocations(taxableAlloc),
      assetClassReturns: {
        ...DEFAULT_SCENARIO.investments.assetClassReturns,
        bonds: { mean: 0.045, stdDev: 0 },
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

describe('Taxable-account dividend/interest drag', () => {
  it('bond interest is taxed annually as ordinary income', () => {
    // $1M taxable, 100% bonds at 4.5% mean → $45,000 interest in year 1.
    // Single/TX: 45,000 − 16,100 ded = 28,900 taxable
    // → 10%×11,925 + 12%×16,975 = $3,229.50 federal. Spending comes from
    // the untaxed cash account, so interest is the only tax source.
    const scenario = makeScenario(
      { stocks: 0, bonds: 100, cash: 0, crypto: 0 },
      { balances: { ...makeScenario({ stocks: 0, bonds: 100, cash: 0, crypto: 0 }).balances, taxable: 1_000_000, cashAccount: 500_000 } },
    );
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const first = result.medianPath[0];
    expect(first.taxes.federal).toBeCloseTo(3229.5, 0);
    expect(first.taxes.state).toBe(0); // TX
  });

  it('stock dividends are taxed annually at LTCG rates (qualified)', () => {
    // $4M taxable, 100% stocks → 1.8% yield = $72,000 qualified dividends.
    // No ordinary income → LTCG stack from 0: 0% to 48,350, 15% above
    // → 15% × 23,650 = $3,547.50.
    const scenario = makeScenario(
      { stocks: 100, bonds: 0, cash: 0, crypto: 0 },
      { balances: { ...makeScenario({ stocks: 100, bonds: 0, cash: 0, crypto: 0 }).balances, taxable: 4_000_000, cashAccount: 500_000 } },
    );
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const first = result.medianPath[0];
    expect(first.taxes.capitalGains).toBeCloseTo(3547.5, 0);
    expect(first.taxes.federal).toBeCloseTo(3547.5, 0);
  });

  it('reinvested distributions add to cost basis — no phantom gains at withdrawal', () => {
    // 100% bonds, all-basis account, spending drawn FROM taxable. Interest is
    // taxed each year and reinvested, so basis keeps pace with the balance
    // and withdrawals never realize capital gains.
    const scenario = makeScenario(
      { stocks: 0, bonds: 100, cash: 0, crypto: 0 },
      { balances: { ...makeScenario({ stocks: 0, bonds: 100, cash: 0, crypto: 0 }).balances, taxable: 1_000_000 } },
    );
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    let sawTaxableWithdrawal = false;
    for (const yr of result.medianPath) {
      if (yr.withdrawals.taxable > 0) sawTaxableWithdrawal = true;
      expect(yr.taxes.capitalGains).toBeCloseTo(0, 0);
    }
    expect(sawTaxableWithdrawal).toBe(true);
  });

  it('no drag on non-taxable accounts (cash account stays untaxed)', () => {
    const scenario = makeScenario(
      { stocks: 0, bonds: 100, cash: 0, crypto: 0 },
      { balances: { ...makeScenario({ stocks: 0, bonds: 100, cash: 0, crypto: 0 }).balances, cashAccount: 500_000 } },
    );
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      expect(yr.taxes.total).toBeCloseTo(0, 0);
    }
  });
});
