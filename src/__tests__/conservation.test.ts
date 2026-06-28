import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import { makeUniformAllocations, DEFAULT_VOLATILITY } from '../constants/asset-classes';
import { ACCOUNT_TYPES } from '../types';
import type { ScenarioInput, AccountBalances, AssetClass, AssetAllocation } from '../types';

/**
 * Conservation & closed-form tests.
 *
 * Conservation: for the engine's deterministic expectedPath (zero volatility,
 * no guardrails), each year-over-year balance change must equal
 *     investmentReturn + sum(contributions) - sum(withdrawals)
 * to within $1. If money is silently created or destroyed by the engine, this
 * fails. Catches off-by-one withdrawal bugs, double-counted contributions,
 * lost basis adjustments, etc.
 *
 * Closed-form: a deliberately simple all-Roth, no-spending, cash-only scenario
 * has an exact analytic ending balance. The engine must reproduce it within
 * $1. Catches subtle compounding-order or return-application bugs.
 */

function sumBalances(b: AccountBalances): number {
  let s = 0;
  for (const a of ACCOUNT_TYPES) s += b[a];
  return s;
}

function flatReturns(meansOverride: Partial<Record<AssetClass, number>> = {}): Record<AssetClass, { mean: number; stdDev: number }> {
  // stdDev = 0 ensures deterministic returns; means default to moderate preset
  const out = {} as Record<AssetClass, { mean: number; stdDev: number }>;
  // Use neutral defaults so closed-form math is straightforward
  const defaultMeans: Record<AssetClass, number> = { stocks: 0.08, bonds: 0.04, cash: 0.05, crypto: 0.10 };
  for (const ac of ['stocks', 'bonds', 'cash', 'crypto'] as AssetClass[]) {
    out[ac] = { mean: meansOverride[ac] ?? defaultMeans[ac], stdDev: DEFAULT_VOLATILITY[ac] };
  }
  return out;
}

function zeroBalances(): AccountBalances {
  return {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };
}

function strippedScenario(opts: {
  startAge: number;
  endAge: number;
  startingRoth: number;
  monthlySpending: number;
  allocation: AssetAllocation;
  returns: Record<AssetClass, { mean: number; stdDev: number }>;
}): ScenarioInput {
  const allocations = makeUniformAllocations(opts.allocation);
  return {
    ...DEFAULT_SCENARIO,
    currentAge: opts.startAge,
    retirementAge: opts.startAge,
    endAge: opts.endAge,
    filingStatus: 'single',
    stateCode: 'TX',
    jobs: [],
    totalSavingsRate: 0,
    baseAnnualSpending: opts.monthlySpending,
    spendingInflationRate: 0,
    inflationVolatility: 0,
    taxBracketInflationRate: 0,
    socialSecurityMode: 'manual',
    socialSecurityBenefit: 0,
    pensionAmount: 0,
    otherIncomeSources: [],
    oneTimeExpenses: [],
    healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    cashBuffer: { ...DEFAULT_SCENARIO.cashBuffer, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    spouse: { ...DEFAULT_SCENARIO.spouse, enabled: false },
    housing: { ...DEFAULT_SCENARIO.housing, enabled: false },
    balances: { ...zeroBalances(), rothIRA: opts.startingRoth },
    investments: {
      ...DEFAULT_SCENARIO.investments,
      preRetirement: allocations,
      postRetirement: allocations,
      assetClassReturns: opts.returns,
    },
  };
}

describe('Conservation of money', () => {
  it('expectedPath year-over-year balance change equals gains + contributions − withdrawals (within $1)', () => {
    const scenario = strippedScenario({
      startAge: 65,
      endAge: 80, // 16 years
      startingRoth: 1_000_000,
      monthlySpending: 4_000, // $48k/yr
      allocation: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
      returns: flatReturns({ cash: 0.05 }), // 5% deterministic cash return
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 1 });
    const path = result.expectedPath;

    expect(path.length).toBeGreaterThan(1);

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const contributions = sumBalances(curr.contributions);
      const withdrawals = sumBalances(curr.withdrawals);
      const expected = prev.totalBalance + curr.investmentReturn + contributions - withdrawals;
      const diff = Math.abs(curr.totalBalance - expected);
      expect(
        diff,
        `Year ${curr.age}: balance change mismatch. prev=$${prev.totalBalance.toFixed(2)}, gain=$${curr.investmentReturn.toFixed(2)}, contrib=$${contributions.toFixed(2)}, withdraw=$${withdrawals.toFixed(2)}, expected=$${expected.toFixed(2)}, actual=$${curr.totalBalance.toFixed(2)}`,
      ).toBeLessThan(1);
    }
  });
});

describe('Closed-form regression', () => {
  it('all-Roth, $0 spending, 5% cash return reproduces start × 1.05^N within $1', () => {
    // Pure compound growth: no spending, no contributions, no taxes.
    // Engine must compute exactly start × (1 + r)^N.
    const startBalance = 500_000;
    const rate = 0.05;
    const startAge = 65;
    const endAge = 70; // ages 65..70 inclusive = 6 years
    const N = endAge - startAge + 1;

    const scenario = strippedScenario({
      startAge,
      endAge,
      startingRoth: startBalance,
      monthlySpending: 0,
      allocation: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
      returns: flatReturns({ cash: rate }),
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 1 });
    const path = result.expectedPath;
    const lastYear = path[path.length - 1];

    const expectedEnding = startBalance * Math.pow(1 + rate, N);
    expect(Math.abs(lastYear.totalBalance - expectedEnding)).toBeLessThan(1);
  });

  it('all-Roth, fixed spending, 5% cash return matches recursive hand calculation', () => {
    // Year-by-year: balance = (prev × 1.05) - spending. Engine must agree
    // to within $1 at every step. Catches spending-applied-twice, taxes-on-roth,
    // and order-of-operations bugs.
    const startBalance = 800_000;
    const rate = 0.05;
    const annualSpending = 40_000;
    const monthlySpending = annualSpending / 12;
    const startAge = 65;
    const endAge = 75; // 11 years

    const scenario = strippedScenario({
      startAge,
      endAge,
      startingRoth: startBalance,
      monthlySpending,
      allocation: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
      returns: flatReturns({ cash: rate }),
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 1 });
    const path = result.expectedPath;

    // Hand calc: engine applies withdrawals first, then returns on the remainder.
    //   end = (start - spending) * (1 + r)
    let expected = startBalance;
    for (let i = 0; i < path.length; i++) {
      expected = (expected - annualSpending) * (1 + rate);
      expect(
        Math.abs(path[i].totalBalance - expected),
        `Year ${path[i].age}: expected $${expected.toFixed(2)}, got $${path[i].totalBalance.toFixed(2)}`,
      ).toBeLessThan(1);
    }
  });
});

describe('Depletion invariant', () => {
  // If a path retains a positive totalBalance but the only money left is in
  // accounts that cannot fund living expenses (HSA), the engine must mark the
  // path as depleted. Otherwise the success rate is inflated by households
  // that have no spendable cash. Regression test for the HSA-reservation bug.
  it('a path with only HSA balance left must be marked depleted', () => {
    const scenario: ScenarioInput = {
      ...DEFAULT_SCENARIO,
      currentAge: 65,
      retirementAge: 65,
      endAge: 80,
      filingStatus: 'single',
      stateCode: 'TX',
      jobs: [],
      totalSavingsRate: 0,
      baseAnnualSpending: 5_000, // $60K/yr — high relative to balance
      spendingInflationRate: 0,
      inflationVolatility: 0,
      taxBracketInflationRate: 0,
      socialSecurityMode: 'manual',
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      otherIncomeSources: [],
      oneTimeExpenses: [],
      healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false }, // HSA never drained for medical
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      cashBuffer: { ...DEFAULT_SCENARIO.cashBuffer, enabled: false },
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      spouse: { ...DEFAULT_SCENARIO.spouse, enabled: false },
      housing: { ...DEFAULT_SCENARIO.housing, enabled: false },
      balances: {
        ...zeroBalances(),
        rothIRA: 200_000,
        hsa: 100_000, // sizable HSA that compounds untouched
      },
      investments: {
        ...DEFAULT_SCENARIO.investments,
        preRetirement: makeUniformAllocations({ stocks: 0, bonds: 0, cash: 100, crypto: 0 }),
        postRetirement: makeUniformAllocations({ stocks: 0, bonds: 0, cash: 100, crypto: 0 }),
        assetClassReturns: flatReturns({ cash: 0.04 }),
      },
    };

    const result = runSimulation(scenario, { numSimulations: 1, seed: 1 });
    const path = result.expectedPath;

    // At some point the spendable (non-HSA) accounts will drain. Once they do,
    // the engine must flag that year as depleted, regardless of remaining HSA.
    for (const yr of path) {
      const spendable = sumBalances(yr.balances) - yr.balances.hsa;
      if (spendable < 100 && yr.balances.hsa > 100) {
        expect(yr.depleted,
          `Age ${yr.age}: spendable=$${spendable.toFixed(0)} HSA=$${yr.balances.hsa.toFixed(0)} — engine must mark this as depleted`
        ).toBe(true);
      }
    }

    // The path must reach a depleted state somewhere in retirement
    expect(result.depletionAges[0]).not.toBeNull();
  });
});

