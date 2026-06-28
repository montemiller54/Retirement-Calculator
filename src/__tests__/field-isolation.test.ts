import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput } from '../types';

/**
 * Isolated-field sensitivity tests.
 *
 * Each test changes exactly ONE user-configurable field (or one tightly-coupled
 * pair) and asserts the output moves. These catch "dead control" bugs where a
 * UI input is rendered but silently ignored by the engine — a class of bug
 * that grouped sensitivity tests cannot detect (because a working sibling
 * field can mask a broken one).
 */

const SIMS = 300;
const SEED = 42;

function run(overrides: Partial<ScenarioInput>) {
  const scenario: ScenarioInput = { ...DEFAULT_SCENARIO, socialSecurityMode: 'manual', ...overrides };
  const result = runSimulation(scenario, { numSimulations: SIMS, seed: SEED });
  const sorted = [...result.endingBalances].sort((a, b) => a - b);
  return {
    successRate: result.successRate,
    medianEnding: sorted[Math.floor(sorted.length / 2)],
  };
}

function withInvestments(overrides: Partial<ScenarioInput['investments']>): ScenarioInput['investments'] {
  return { ...DEFAULT_SCENARIO.investments, ...overrides };
}

// Move minimum: medianEnding differences must exceed this in dollars to count
// as a real signal (not MC noise). Roughly 0.05% of a $1M portfolio.
const MIN_MEDIAN_MOVE = 500;

// ═══════════════════════════════════════════════════════════════════
// ASSET-CLASS INPUTS — each mean/stdDev tested alone
// (these were silently dead before the math.ts wiring fix)
// ═══════════════════════════════════════════════════════════════════

describe('Asset-class inputs (isolated)', () => {
  it('stocks.mean alone moves success rate (higher mean → higher success)', () => {
    const low = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, stocks: { mean: 0.04, stdDev: 0.16 } },
    }) });
    const high = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, stocks: { mean: 0.14, stdDev: 0.16 } },
    }) });
    expect(high.successRate).toBeGreaterThan(low.successRate + 0.05);
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('stocks.stdDev alone moves median ending (higher vol → wider distribution)', () => {
    const low = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, stocks: { mean: 0.10, stdDev: 0.08 } },
    }) });
    const high = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, stocks: { mean: 0.10, stdDev: 0.30 } },
    }) });
    // Different vol must produce a different median (control is wired)
    expect(Math.abs(high.medianEnding - low.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });

  it('bonds.mean alone moves median ending (higher → higher)', () => {
    const low = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, bonds: { mean: 0.01, stdDev: 0.06 } },
    }) });
    const high = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, bonds: { mean: 0.08, stdDev: 0.06 } },
    }) });
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('bonds.stdDev alone moves median ending', () => {
    const low = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, bonds: { mean: 0.04, stdDev: 0.02 } },
    }) });
    const high = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, bonds: { mean: 0.04, stdDev: 0.15 } },
    }) });
    expect(Math.abs(high.medianEnding - low.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });

  it('cash.mean alone moves median ending (higher → higher)', () => {
    // Default has 10% cash in pre-retirement, 15% in post — small but real
    const low = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, cash: { mean: 0.0, stdDev: 0.01 } },
    }) });
    const high = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, cash: { mean: 0.06, stdDev: 0.01 } },
    }) });
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('crypto.mean alone moves median ending when crypto is allocated', () => {
    const cryptoAlloc = {
      traditional401k: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      roth401k: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      traditionalIRA: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      rothIRA: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      taxable: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      hsa: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      cashAccount: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      otherAssets: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
    };
    const low = run({ investments: withInvestments({
      preRetirement: cryptoAlloc, postRetirement: cryptoAlloc,
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, crypto: { mean: -0.05, stdDev: 0.50 } },
    }) });
    const high = run({ investments: withInvestments({
      preRetirement: cryptoAlloc, postRetirement: cryptoAlloc,
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, crypto: { mean: 0.30, stdDev: 0.50 } },
    }) });
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('crypto.stdDev alone affects distribution when crypto is allocated', () => {
    const cryptoAlloc = {
      traditional401k: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      roth401k: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      traditionalIRA: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      rothIRA: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      taxable: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      hsa: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      cashAccount: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
      otherAssets: { stocks: 60, bonds: 25, cash: 5, crypto: 10 },
    };
    const low = run({ investments: withInvestments({
      preRetirement: cryptoAlloc, postRetirement: cryptoAlloc,
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, crypto: { mean: 0.15, stdDev: 0.20 } },
    }) });
    const high = run({ investments: withInvestments({
      preRetirement: cryptoAlloc, postRetirement: cryptoAlloc,
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, crypto: { mean: 0.15, stdDev: 0.80 } },
    }) });
    expect(Math.abs(high.medianEnding - low.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SOCIAL SECURITY / PENSION sub-fields tested individually
// ═══════════════════════════════════════════════════════════════════

describe('Income sources (isolated)', () => {
  it('socialSecurityClaimAge alone moves median ending (earlier → more)', () => {
    const early = run({ socialSecurityClaimAge: 62 });
    const late = run({ socialSecurityClaimAge: 70 });
    expect(early.medianEnding).toBeGreaterThan(late.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('socialSecurityCOLA alone moves median ending (higher → higher)', () => {
    const low = run({ socialSecurityCOLA: 0.0 });
    const high = run({ socialSecurityCOLA: 0.05 });
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('pensionStartAge alone moves median ending', () => {
    const base: Partial<ScenarioInput> = { pensionAmount: 2000, pensionCOLA: 0.0 };
    const early = run({ ...base, pensionStartAge: 60 });
    const late = run({ ...base, pensionStartAge: 80 });
    expect(early.medianEnding).toBeGreaterThan(late.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('pensionCOLA alone moves median ending (higher → higher)', () => {
    const base: Partial<ScenarioInput> = { pensionAmount: 2000, pensionStartAge: 65 };
    const noCOLA = run({ ...base, pensionCOLA: 0.0 });
    const withCOLA = run({ ...base, pensionCOLA: 0.04 });
    expect(withCOLA.medianEnding).toBeGreaterThan(noCOLA.medianEnding + MIN_MEDIAN_MOVE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// HEALTHCARE sub-fields — each tested alone
// ═══════════════════════════════════════════════════════════════════

describe('Healthcare sub-fields (isolated)', () => {
  const hcBase = { ...DEFAULT_SCENARIO.healthcare, enabled: true };
  // Funded retiree so healthcare cost differences are visible (not masked by depletion)
  const fundedBase: Partial<ScenarioInput> = {
    currentAge: 55, retirementAge: 55, endAge: 90, jobs: [],
    balances: { traditional401k: 1500000, roth401k: 0, traditionalIRA: 0, rothIRA: 500000, taxable: 500000, hsa: 0, cashAccount: 100000, otherAssets: 0 },
    baseAnnualSpending: 4000, socialSecurityBenefit: 2500,
  };

  it('preMedicareMonthly alone moves median (matters before Medicare age)', () => {
    const low = run({ ...fundedBase, healthcare: { ...hcBase, preMedicareMonthly: 200 } });
    const high = run({ ...fundedBase, healthcare: { ...hcBase, preMedicareMonthly: 3000 } });
    expect(low.medianEnding).toBeGreaterThan(high.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('medicareMonthly alone moves median (Medicare-age years)', () => {
    const low = run({ ...fundedBase, healthcare: { ...hcBase, medicareMonthly: 100 } });
    const high = run({ ...fundedBase, healthcare: { ...hcBase, medicareMonthly: 2000 } });
    expect(low.medianEnding).toBeGreaterThan(high.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('lateLifeMonthly alone moves median', () => {
    const low = run({ ...fundedBase, healthcare: { ...hcBase, lateLifeMonthly: 200 } });
    const high = run({ ...fundedBase, healthcare: { ...hcBase, lateLifeMonthly: 4000 } });
    expect(low.medianEnding).toBeGreaterThan(high.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('medicareStartAge alone moves median (earlier Medicare → lower costs)', () => {
    const early = run({ ...fundedBase, healthcare: { ...hcBase, preMedicareMonthly: 2000, medicareMonthly: 300, medicareStartAge: 62 } });
    const late  = run({ ...fundedBase, healthcare: { ...hcBase, preMedicareMonthly: 2000, medicareMonthly: 300, medicareStartAge: 70 } });
    expect(early.medianEnding).toBeGreaterThan(late.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('lateLifeStartAge alone moves median (later → less late-life cost)', () => {
    const early = run({ ...fundedBase, healthcare: { ...hcBase, lateLifeMonthly: 3000, lateLifeStartAge: 75 } });
    const late  = run({ ...fundedBase, healthcare: { ...hcBase, lateLifeMonthly: 3000, lateLifeStartAge: 90 } });
    expect(late.medianEnding).toBeGreaterThan(early.medianEnding + MIN_MEDIAN_MOVE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SPOUSE sub-fields — each tested alone
// (previously all asserted abs(diff) >= 0 which is vacuous)
// ═══════════════════════════════════════════════════════════════════

describe('Spouse sub-fields (isolated)', () => {
  // Funded scenario so SS differences manifest as ending balance differences,
  // not as identical depletion.
  const spouseBase: Partial<ScenarioInput> = {
    currentAge: 65, retirementAge: 65, endAge: 95,
    jobs: [],
    filingStatus: 'mfj',
    balances: { traditional401k: 800000, roth401k: 0, traditionalIRA: 0, rothIRA: 200000, taxable: 200000, hsa: 0, cashAccount: 50000, otherAssets: 0 },
    baseAnnualSpending: 5000,
    socialSecurityBenefit: 2000,
  };

  it('spouse.enabled alone changes outcome (adds SS income + MFJ filing)', () => {
    const solo = run({ ...spouseBase, spouse: { enabled: false, currentAge: 63, socialSecurityBenefit: 1500, retirementAge: 65, socialSecurityClaimAge: 67 } });
    const dual = run({ ...spouseBase, spouse: { enabled: true,  currentAge: 63, socialSecurityBenefit: 1500, retirementAge: 65, socialSecurityClaimAge: 67 } });
    // Spouse adds SS income → higher median ending (direction known)
    expect(dual.medianEnding).toBeGreaterThan(solo.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('spouse.socialSecurityBenefit alone moves median', () => {
    const low = run({ ...spouseBase, spouse: { enabled: true, currentAge: 63, socialSecurityBenefit: 500,  retirementAge: 65, socialSecurityClaimAge: 67 } });
    const high = run({ ...spouseBase, spouse: { enabled: true, currentAge: 63, socialSecurityBenefit: 3500, retirementAge: 65, socialSecurityClaimAge: 67 } });
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('spouse.socialSecurityClaimAge alone moves median', () => {
    const early = run({ ...spouseBase, spouse: { enabled: true, currentAge: 63, socialSecurityBenefit: 2000, retirementAge: 65, socialSecurityClaimAge: 62 } });
    const late  = run({ ...spouseBase, spouse: { enabled: true, currentAge: 63, socialSecurityBenefit: 2000, retirementAge: 65, socialSecurityClaimAge: 70 } });
    expect(early.medianEnding).toBeGreaterThan(late.medianEnding + MIN_MEDIAN_MOVE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ROTH CONVERSION sub-fields
// ═══════════════════════════════════════════════════════════════════

describe('Roth conversion sub-fields (isolated)', () => {
  const rcBase: Partial<ScenarioInput> = {
    currentAge: 60, retirementAge: 65, endAge: 95,
    balances: { traditional401k: 1500000, roth401k: 0, traditionalIRA: 500000, rothIRA: 50000, taxable: 100000, hsa: 0, cashAccount: 0, otherAssets: 0 },
    baseAnnualSpending: 4500, socialSecurityBenefit: 2000,
  };

  it('rothConversion.startAge alone moves median', () => {
    const early = run({ ...rcBase, rothConversion: { enabled: true, strategy: 'fixedAmount', fixedAnnualAmount: 50000, targetBracketRate: 0.12, startAge: 60, endAge: 72 } });
    const late  = run({ ...rcBase, rothConversion: { enabled: true, strategy: 'fixedAmount', fixedAnnualAmount: 50000, targetBracketRate: 0.12, startAge: 70, endAge: 72 } });
    expect(Math.abs(early.medianEnding - late.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });

  it('rothConversion.endAge alone moves median', () => {
    const short = run({ ...rcBase, rothConversion: { enabled: true, strategy: 'fixedAmount', fixedAnnualAmount: 50000, targetBracketRate: 0.12, startAge: 65, endAge: 66 } });
    const long  = run({ ...rcBase, rothConversion: { enabled: true, strategy: 'fixedAmount', fixedAnnualAmount: 50000, targetBracketRate: 0.12, startAge: 65, endAge: 80 } });
    expect(Math.abs(short.medianEnding - long.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });

  it('rothConversion.fixedAnnualAmount alone moves median', () => {
    const small = run({ ...rcBase, rothConversion: { enabled: true, strategy: 'fixedAmount', fixedAnnualAmount: 10000,  targetBracketRate: 0.12, startAge: 65, endAge: 72 } });
    const big   = run({ ...rcBase, rothConversion: { enabled: true, strategy: 'fixedAmount', fixedAnnualAmount: 150000, targetBracketRate: 0.12, startAge: 65, endAge: 72 } });
    expect(Math.abs(small.medianEnding - big.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// HOUSING sub-fields
// ═══════════════════════════════════════════════════════════════════

describe('Housing sub-fields (isolated)', () => {
  const housingBase: Partial<ScenarioInput> = {
    currentAge: 55, retirementAge: 65, endAge: 95,
    balances: { traditional401k: 600000, roth401k: 0, traditionalIRA: 0, rothIRA: 0, taxable: 200000, hsa: 0, cashAccount: 0, otherAssets: 0 },
    baseAnnualSpending: 4000, socialSecurityBenefit: 2000,
  };

  it('housing.mortgagePayment alone moves median (higher → lower)', () => {
    const low = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 500,  payoffAge: 75, downsizingProceeds: 0, downsizingAge: 80 } });
    const high = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 3000, payoffAge: 75, downsizingProceeds: 0, downsizingAge: 80 } });
    expect(low.medianEnding).toBeGreaterThan(high.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('housing.payoffAge alone moves median (later → less ending)', () => {
    const early = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 2000, payoffAge: 65, downsizingProceeds: 0, downsizingAge: 90 } });
    const late  = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 2000, payoffAge: 85, downsizingProceeds: 0, downsizingAge: 90 } });
    expect(early.medianEnding).toBeGreaterThan(late.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('housing.downsizingProceeds alone moves median (higher → higher)', () => {
    const none = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 1500, payoffAge: 70, downsizingProceeds: 0,      downsizingAge: 72 } });
    const big  = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 1500, payoffAge: 70, downsizingProceeds: 400000, downsizingAge: 72 } });
    expect(big.medianEnding).toBeGreaterThan(none.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('housing.downsizingAge alone moves median', () => {
    const early = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 1500, payoffAge: 70, downsizingProceeds: 300000, downsizingAge: 66 } });
    const late  = run({ ...housingBase, housing: { enabled: true, mortgagePayment: 1500, payoffAge: 70, downsizingProceeds: 300000, downsizingAge: 90 } });
    // Earlier downsizing → proceeds earn returns for longer → higher ending
    expect(early.medianEnding).toBeGreaterThan(late.medianEnding + MIN_MEDIAN_MOVE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MISC INDIVIDUAL CONTROLS
// ═══════════════════════════════════════════════════════════════════

describe('Miscellaneous controls (isolated)', () => {
  it('inflationVolatility alone affects distribution', () => {
    const none = run({ inflationVolatility: 0.0 });
    const high = run({ inflationVolatility: 0.05 });
    expect(Math.abs(none.medianEnding - high.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });

  it('cashBuffer.yearsOfExpenses alone moves median (when enabled)', () => {
    // Need a scenario where cash buffer mechanics actually bite (lots of
    // spending pressure with growth assets). Bigger gap between sizes.
    const base: Partial<ScenarioInput> = {
      currentAge: 65, retirementAge: 65, endAge: 95, jobs: [],
      balances: { traditional401k: 500000, roth401k: 0, traditionalIRA: 0, rothIRA: 300000, taxable: 200000, hsa: 0, cashAccount: 200000, otherAssets: 0 },
      baseAnnualSpending: 5500, socialSecurityBenefit: 2000,
    };
    const small = run({ ...base, cashBuffer: { enabled: true, yearsOfExpenses: 0.5, refillInUpMarkets: true } });
    const big   = run({ ...base, cashBuffer: { enabled: true, yearsOfExpenses: 10,  refillInUpMarkets: true } });
    expect(Math.abs(small.medianEnding - big.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });

  it('cashBuffer.refillInUpMarkets alone changes outcome', () => {
    const base: Partial<ScenarioInput> = {
      currentAge: 65, retirementAge: 65, endAge: 90, jobs: [],
      balances: { traditional401k: 300000, roth401k: 0, traditionalIRA: 0, rothIRA: 100000, taxable: 100000, hsa: 0, cashAccount: 150000, otherAssets: 0 },
      baseAnnualSpending: 4500, socialSecurityBenefit: 2000,
    };
    const noRefill = run({ ...base, cashBuffer: { enabled: true, yearsOfExpenses: 3, refillInUpMarkets: false } });
    const refill   = run({ ...base, cashBuffer: { enabled: true, yearsOfExpenses: 3, refillInUpMarkets: true } });
    expect(Math.abs(noRefill.medianEnding - refill.medianEnding)).toBeGreaterThan(MIN_MEDIAN_MOVE);
  });

  it('ruleof55Eligible alone moves median (early retiree with traditional)', () => {
    const early: Partial<ScenarioInput> = {
      currentAge: 55, retirementAge: 55, endAge: 90,
      jobs: [],
      balances: { traditional401k: 1000000, roth401k: 0, traditionalIRA: 0, rothIRA: 0, taxable: 50000, hsa: 0, cashAccount: 0, otherAssets: 0 },
      baseAnnualSpending: 4000, socialSecurityBenefit: 2000, socialSecurityClaimAge: 67,
    };
    const off = run({ ...early, ruleof55Eligible: false });
    const on  = run({ ...early, ruleof55Eligible: true });
    expect(on.medianEnding).toBeGreaterThan(off.medianEnding + MIN_MEDIAN_MOVE);
  });

  it('rothContributionBasis alone moves median (early retiree with Roth)', () => {
    // Penalty-free Roth basis only matters when forced to draw from Roth
    // before 59.5 with no other penalty-exempt accounts. Portfolio must be
    // large enough to survive — otherwise both cases just deplete to 0.
    const early: Partial<ScenarioInput> = {
      currentAge: 50, retirementAge: 50, endAge: 75,
      jobs: [],
      balances: { traditional401k: 0, roth401k: 0, traditionalIRA: 0, rothIRA: 2000000, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 },
      baseAnnualSpending: 4000, socialSecurityBenefit: 2000, socialSecurityClaimAge: 67,
      ruleof55Eligible: false,
    };
    const noBasis   = run({ ...early, rothContributionBasis: 0 });
    const withBasis = run({ ...early, rothContributionBasis: 800000 });
    expect(withBasis.medianEnding).toBeGreaterThan(noBasis.medianEnding + MIN_MEDIAN_MOVE);
  });
});
