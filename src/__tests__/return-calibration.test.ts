import { describe, it, expect } from 'vitest';
import { sampleBlendedReturns } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import {
  makeUniformAllocations,
  RETURN_OUTLOOK_PRESETS,
  DEFAULT_VOLATILITY,
} from '../constants/asset-classes';
import { ASSET_CLASSES } from '../types';
import type { ScenarioInput, AssetAllocation, AssetClass } from '../types';

/**
 * Return-calibration tests.
 *
 * These tests bypass spending/taxes/contributions and verify that the engine's
 * year-over-year balance growth reflects the user-configured per-asset-class
 * mean and stdDev. They catch two classes of bug that ordinary sensitivity
 * tests miss:
 *
 *   1. A parameter that is silently ignored or hardcoded (the "10% bug"):
 *      shifting `mean` by +X should shift the empirical long-run mean by ≈ +X.
 *   2. A return-distribution model with unrealistic tails (the "Student-t df=6
 *      wipeout bug"): no single annual return should be worse than -65%.
 *
 * Baselines come from RETURN_OUTLOOK_PRESETS.moderate and DEFAULT_VOLATILITY
 * so retuning those constants does not invalidate the tests.
 */

const BASELINE_MEANS = RETURN_OUTLOOK_PRESETS.moderate.means;
const BASELINE_CRASH_FREQ = RETURN_OUTLOOK_PRESETS.moderate.crashFrequency;
const NUM_PATHS = 500;
const SEED = 42;

function buildReturns(
  meansOverride: Partial<Record<AssetClass, number>> = {},
  stdDevOverride: Partial<Record<AssetClass, number>> = {},
): Record<AssetClass, { mean: number; stdDev: number }> {
  const out = {} as Record<AssetClass, { mean: number; stdDev: number }>;
  for (const ac of ASSET_CLASSES) {
    out[ac] = {
      mean: meansOverride[ac] ?? BASELINE_MEANS[ac],
      stdDev: stdDevOverride[ac] ?? DEFAULT_VOLATILITY[ac],
    };
  }
  return out;
}

function strippedScenario(
  alloc: AssetAllocation,
  returns: Record<AssetClass, { mean: number; stdDev: number }>,
): ScenarioInput {
  const allocations = makeUniformAllocations(alloc);
  return {
    ...DEFAULT_SCENARIO,
    currentAge: 60,
    retirementAge: 60,
    endAge: 90, // 30 annual return samples per path
    filingStatus: 'single',
    stateCode: 'TX',
    jobs: [],
    totalSavingsRate: 0,
    baseAnnualSpending: 0,
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
    balances: {
      traditional401k: 0,
      roth401k: 0,
      traditionalIRA: 0,
      rothIRA: 1_000_000, // Roth = no tax withdrawal drag
      taxable: 0,
      hsa: 0,
      cashAccount: 0,
      otherAssets: 0,
    },
    investments: {
      ...DEFAULT_SCENARIO.investments,
      preRetirement: allocations,
      postRetirement: allocations,
      assetClassReturns: returns,
      crashFrequency: BASELINE_CRASH_FREQ,
    },
  };
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length;
  return Math.sqrt(v);
}

function sample(alloc: AssetAllocation, returns: ReturnType<typeof buildReturns>): number[] {
  return sampleBlendedReturns(strippedScenario(alloc, returns), { numPaths: NUM_PATHS, seed: SEED });
}

const SHIFT = 0.05;
const SHIFT_MIN = 0.030; // catches stuck-at-default (would be ~0)
const SHIFT_MAX = 0.075; // catches over-amplification

describe('Return calibration: per-asset-class mean shift propagation', () => {
  it('stocks: shifting stocks.mean by +0.05 shifts empirical mean by ≈ +0.05', () => {
    const alloc = { stocks: 100, bonds: 0, cash: 0, crypto: 0 };
    const base = sample(alloc, buildReturns());
    const shifted = sample(alloc, buildReturns({ stocks: BASELINE_MEANS.stocks + SHIFT }));
    const delta = mean(shifted) - mean(base);
    expect(delta).toBeGreaterThan(SHIFT_MIN);
    expect(delta).toBeLessThan(SHIFT_MAX);
  });

  it('bonds: shifting bonds.mean by +0.05 shifts empirical mean by ≈ +0.05', () => {
    const alloc = { stocks: 0, bonds: 100, cash: 0, crypto: 0 };
    const base = sample(alloc, buildReturns());
    const shifted = sample(alloc, buildReturns({ bonds: BASELINE_MEANS.bonds + SHIFT }));
    const delta = mean(shifted) - mean(base);
    expect(delta).toBeGreaterThan(SHIFT_MIN);
    expect(delta).toBeLessThan(SHIFT_MAX);
  });

  it('cash: shifting cash.mean by +0.05 shifts empirical mean by ≈ +0.05', () => {
    const alloc = { stocks: 0, bonds: 0, cash: 100, crypto: 0 };
    const base = sample(alloc, buildReturns());
    const shifted = sample(alloc, buildReturns({ cash: BASELINE_MEANS.cash + SHIFT }));
    const delta = mean(shifted) - mean(base);
    expect(delta).toBeGreaterThan(SHIFT_MIN);
    expect(delta).toBeLessThan(SHIFT_MAX);
  });

  it('crypto: shifting crypto.mean by +0.05 shifts empirical mean by ≈ +0.05', () => {
    const alloc = { stocks: 0, bonds: 0, cash: 0, crypto: 100 };
    const base = sample(alloc, buildReturns());
    const shifted = sample(alloc, buildReturns({ crypto: BASELINE_MEANS.crypto + SHIFT }));
    const delta = mean(shifted) - mean(base);
    expect(delta).toBeGreaterThan(SHIFT_MIN);
    expect(delta).toBeLessThan(SHIFT_MAX);
  });
});

describe('Return calibration: tail shape sanity', () => {
  it('100% stocks: no single annual return worse than -60% (engine floor)', () => {
    const alloc = { stocks: 100, bonds: 0, cash: 0, crypto: 0 };
    const returns = sample(alloc, buildReturns());
    const worst = Math.min(...returns);
    // Engine floor is -0.60; tolerance covers float precision
    expect(worst).toBeGreaterThanOrEqual(-0.6 - 1e-9);
  });

  it('100% bonds: no single annual return worse than -30%', () => {
    const alloc = { stocks: 0, bonds: 100, cash: 0, crypto: 0 };
    const returns = sample(alloc, buildReturns());
    const worst = Math.min(...returns);
    expect(worst).toBeGreaterThan(-0.30);
  });

  it('100% cash: no single annual return worse than -10%', () => {
    const alloc = { stocks: 0, bonds: 0, cash: 100, crypto: 0 };
    const returns = sample(alloc, buildReturns());
    const worst = Math.min(...returns);
    expect(worst).toBeGreaterThan(-0.10);
  });
});

describe('Return calibration: stdDev sensitivity', () => {
  it('halving stocks.stdDev measurably reduces empirical stdDev', () => {
    const alloc = { stocks: 100, bonds: 0, cash: 0, crypto: 0 };
    const base = sample(alloc, buildReturns());
    const halved = sample(alloc, buildReturns({}, { stocks: DEFAULT_VOLATILITY.stocks / 2 }));
    expect(stdDev(halved)).toBeLessThan(stdDev(base) * 0.85);
  });

  it('halving bonds.stdDev measurably reduces empirical stdDev', () => {
    const alloc = { stocks: 0, bonds: 100, cash: 0, crypto: 0 };
    const base = sample(alloc, buildReturns());
    const halved = sample(alloc, buildReturns({}, { bonds: DEFAULT_VOLATILITY.bonds / 2 }));
    expect(stdDev(halved)).toBeLessThan(stdDev(base) * 0.85);
  });
});
