import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import { makeUniformAllocations } from '../constants/asset-classes';
import type { ScenarioInput, AssetAllocation } from '../types';

/**
 * Cross-output consistency tests.
 *
 * The engine returns several views of one Monte Carlo run: percentileBands,
 * endingBalances, medianPath, averagePath, expectedPath, worstDecilePath.
 * Sensitivity and calibration tests verify the statistics; these tests verify
 * that the *display paths* the UI plots are faithful to those statistics.
 *
 * Two historical bugs motivate this file:
 *   1. medianPath was built from paths ranked p45–p55 by ending balance. When
 *      success < 55% that band is an arbitrary slice of $0-ending paths, so the
 *      "median" pre-retirement balance landed near p35.
 *   2. expectedPath zeroed stdDev but still ran regime-switching, so the
 *      "average" projection compounded at the bull-regime mean (~15%) rather
 *      than the user's configured mean.
 */

const SIMS = 2000;
const SEED = 4242;
const ALLOC: AssetAllocation = { stocks: 80, bonds: 20, cash: 0, crypto: 0 };

// Early retiree with a 7-year pure-growth runway (no contributions, no spending
// before 55) and spending tuned so ~45% of paths survive — the p45–p55 band
// then straddles the $0 cliff, which is where the old selection broke.
const lowSuccess: ScenarioInput = {
  ...DEFAULT_SCENARIO,
  name: 'path-consistency-low-success',
  currentAge: 48, retirementAge: 55, endAge: 94,
  filingStatus: 'mfj', stateCode: 'IA',
  jobs: [{
    id: 'j', name: 'Job', owner: 'primary', monthlyPay: 20000, startAge: 48, endAge: 55,
    has401k: false, employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0,
  }],
  totalSavingsRate: 0,
  baseMonthlySpending: 9500,
  spendingInflationRate: 0.025,
  inflationVolatility: 0,
  socialSecurityMode: 'manual', socialSecurityBenefit: 2500, socialSecurityClaimAge: 65,
  pensionAmount: 0,
  otherIncomeSources: [],
  oneTimeExpenses: [],
  healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
  guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
  rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
  housing: { ...DEFAULT_SCENARIO.housing, enabled: false },
  spouse: { ...DEFAULT_SCENARIO.spouse, enabled: false },
  ruleof55Eligible: true,
  balances: {
    traditional401k: 900000, roth401k: 300000, traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0,
  },
  investments: {
    ...DEFAULT_SCENARIO.investments,
    preRetirement: makeUniformAllocations(ALLOC),
    postRetirement: makeUniformAllocations(ALLOC),
  },
};

const highSuccess: ScenarioInput = { ...DEFAULT_SCENARIO, name: 'path-consistency-high-success', inflationVolatility: 0 };

function cagr(start: number, end: number, years: number): number {
  return Math.pow(end / start, 1 / years) - 1;
}

function blendedMean(s: ScenarioInput, alloc: AssetAllocation): number {
  const r = s.investments.assetClassReturns;
  return (alloc.stocks * r.stocks.mean + alloc.bonds * r.bonds.mean
    + alloc.cash * r.cash.mean + alloc.crypto * r.crypto.mean) / 100;
}

describe('Path consistency: medianPath vs percentile bands', () => {
  const result = runSimulation(lowSuccess, { numSimulations: SIMS, seed: SEED });
  const preRetYears = lowSuccess.retirementAge - lowSuccess.currentAge;
  const startTotal = Object.values(lowSuccess.balances).reduce((a, b) => a + b, 0);
  const lastPreRetAge = lowSuccess.retirementAge - 1;

  it('fixture success rate straddles the p45–p55 band (otherwise the bias is invisible)', () => {
    expect(result.successRate).toBeLessThan(0.55);
    expect(result.successRate).toBeGreaterThan(0.35);
  });

  it('pre-retirement CAGR of medianPath tracks the true per-year p50 CAGR', () => {
    const mp = result.medianPath.find(y => y.age === lastPreRetAge)!.totalBalance;
    const p50 = result.percentileBands.find(b => b.age === lastPreRetAge)!.p50;
    const mpCagr = cagr(startTotal, mp, preRetYears);
    const p50Cagr = cagr(startTotal, p50, preRetYears);
    // Broken selection produced ~-2.6pp; a true median-outcome path runs ~+1pp.
    expect(mpCagr).toBeGreaterThan(p50Cagr - 0.01);
    expect(mpCagr).toBeLessThan(p50Cagr + 0.03);
  });

  it('medianPath stays inside the p25–p75 band every pre-retirement year', () => {
    for (const y of result.medianPath) {
      if (y.age >= lowSuccess.retirementAge) break;
      const band = result.percentileBands.find(b => b.age === y.age)!;
      expect(y.totalBalance).toBeGreaterThanOrEqual(band.p25);
      expect(y.totalBalance).toBeLessThanOrEqual(band.p75);
    }
  });

  it('medianPath stays inside the p10–p90 band at every age', () => {
    for (const y of result.medianPath) {
      const band = result.percentileBands.find(b => b.age === y.age)!;
      expect(y.totalBalance).toBeGreaterThanOrEqual(band.p10);
      expect(y.totalBalance).toBeLessThanOrEqual(band.p90);
    }
  });
});

describe('Path consistency: averagePath and worstDecilePath', () => {
  for (const [label, s] of [['low-success', lowSuccess], ['high-success', highSuccess]] as const) {
    const result = runSimulation(s, { numSimulations: SIMS, seed: SEED });
    const last = result.averagePath.length - 1;

    it(`${label}: averagePath final balance equals mean of endingBalances`, () => {
      const mean = result.endingBalances.reduce((a, b) => a + b, 0) / result.endingBalances.length;
      expect(result.averagePath[last].totalBalance).toBeCloseTo(mean, 0);
    });

    it(`${label}: worstDecilePath final balance is at or below p10`, () => {
      expect(result.worstDecilePath[last].totalBalance).toBeLessThanOrEqual(result.percentileBands[last].p10 + 1);
    });
  }
});

describe('Path consistency: expectedPath is a true mean-return projection', () => {
  const result = runSimulation(lowSuccess, { numSimulations: 50, seed: SEED });
  const expectedGrowth = blendedMean(lowSuccess, ALLOC);

  it('compounds at exactly the blended user mean every pre-retirement year', () => {
    const path = result.expectedPath;
    for (let i = 1; i < path.length; i++) {
      if (path[i].age >= lowSuccess.retirementAge) break;
      const yoy = path[i].totalBalance / path[i - 1].totalBalance - 1;
      expect(yoy).toBeCloseTo(expectedGrowth, 6);
    }
  });

  it('does not depend on the Monte Carlo seed', () => {
    const other = runSimulation(lowSuccess, { numSimulations: 50, seed: SEED + 1 });
    for (let i = 0; i < result.expectedPath.length; i++) {
      expect(other.expectedPath[i].totalBalance).toBe(result.expectedPath[i].totalBalance);
    }
  });

  it('is unaffected by crash frequency', () => {
    const pessimistic: ScenarioInput = {
      ...lowSuccess,
      investments: { ...lowSuccess.investments, crashFrequency: 10 },
    };
    const other = runSimulation(pessimistic, { numSimulations: 50, seed: SEED });
    for (let i = 0; i < result.expectedPath.length; i++) {
      expect(other.expectedPath[i].totalBalance).toBe(result.expectedPath[i].totalBalance);
    }
  });
});
