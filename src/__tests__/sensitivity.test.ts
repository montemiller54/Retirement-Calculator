import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import { makeUniformAllocations, RISK_PROFILES } from '../constants/asset-classes';
import type { ScenarioInput } from '../types';
import { ACCOUNT_TYPES } from '../types';

/**
 * Sensitivity tests: for each tunable parameter, run the simulation with two
 * different values and assert the expected directional change.
 *
 * These tests catch "composition bugs" where a parameter is wired through
 * the code but its effect is neutralized or inverted.
 *
 * We use 300 simulations — enough for directional signals, fast enough to run.
 */

const SIMS = 300;
const SEED = 42;

function run(overrides: Partial<ScenarioInput>, numSims = SIMS): { successRate: number; medianEnding: number } {
  const scenario: ScenarioInput = { ...DEFAULT_SCENARIO, socialSecurityMode: 'manual', ...overrides };
  const result = runSimulation(scenario, { numSimulations: numSims, seed: SEED });
  const sorted = [...result.endingBalances].sort((a, b) => a - b);
  return {
    successRate: result.successRate,
    medianEnding: sorted[Math.floor(sorted.length / 2)],
  };
}

// Deep-merge helper for nested investment overrides
function withInvestments(overrides: Partial<ScenarioInput['investments']>): ScenarioInput['investments'] {
  return { ...DEFAULT_SCENARIO.investments, ...overrides };
}

// ═══════════════════════════════════════════════════════════════════
// HIGH IMPACT
// ═══════════════════════════════════════════════════════════════════

describe('HIGH IMPACT: Profile / Time Horizon', () => {
  it('#2 higher retirementAge → monotonically higher success rate (50–70 in 5yr steps)', () => {
    const ages = [50, 55, 60, 65, 70].filter(a => a >= DEFAULT_SCENARIO.currentAge);
    const results = ages.map(retirementAge => ({
      age: retirementAge,
      ...run({
        retirementAge,
        jobs: [{ ...DEFAULT_SCENARIO.jobs[0], endAge: retirementAge }],
      }, 1000),
    }));
    for (let i = 1; i < results.length; i++) {
      // 1000-sim MC noise floor ~0.3pp; allow that much non-monotonicity
      expect(
        results[i].successRate,
        `retire@${results[i].age} (${(results[i].successRate * 100).toFixed(1)}%) should be >= retire@${results[i - 1].age} (${(results[i - 1].successRate * 100).toFixed(1)}%)`,
      ).toBeGreaterThanOrEqual(results[i - 1].successRate - 0.003);
    }
  });

  it('#3 higher endAge → monotonically lower success rate (75–100 in 5yr steps)', () => {
    const ages = [75, 80, 85, 90, 95, 100];
    const results = ages.map(endAge => ({
      age: endAge,
      ...run({ endAge }, 1000),
    }));
    for (let i = 1; i < results.length; i++) {
      expect(
        results[i - 1].successRate,
        `end@${results[i - 1].age} (${(results[i - 1].successRate * 100).toFixed(1)}%) should be >= end@${results[i].age} (${(results[i].successRate * 100).toFixed(1)}%)`,
      ).toBeGreaterThanOrEqual(results[i].successRate - 0.003);
    }
  });
});

describe('HIGH IMPACT: Earnings & Contributions', () => {
  it('#4 higher salary → higher success rate', () => {
    const low = run({ jobs: [{ id: 'test', name: 'Test Job', monthlyPay: 5000, startAge: DEFAULT_SCENARIO.currentAge, endAge: DEFAULT_SCENARIO.retirementAge, has401k: true, employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 }] });
    const high = run({ jobs: [{ id: 'test', name: 'Test Job', monthlyPay: 15000, startAge: DEFAULT_SCENARIO.currentAge, endAge: DEFAULT_SCENARIO.retirementAge, has401k: true, employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 }] });
    expect(high.successRate).toBeGreaterThan(low.successRate);
  });

  it('#6 higher savings rate → higher success rate', () => {
    const low = run({ totalSavingsRate: 0.10 });
    const high = run({ totalSavingsRate: 0.30 });
    expect(high.successRate).toBeGreaterThan(low.successRate);
  });

  it('#8 employer match → higher success rate', () => {
    const noMatch = run({ jobs: [{ id: 'test', name: 'Test Job', monthlyPay: DEFAULT_SCENARIO.jobs[0].monthlyPay, startAge: DEFAULT_SCENARIO.currentAge, endAge: DEFAULT_SCENARIO.retirementAge, has401k: true, employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 }] });
    const withMatch = run({ jobs: [{ id: 'test', name: 'Test Job', monthlyPay: DEFAULT_SCENARIO.jobs[0].monthlyPay, startAge: DEFAULT_SCENARIO.currentAge, endAge: DEFAULT_SCENARIO.retirementAge, has401k: true, employerMatchRate: 1.0, employerMatchCapPct: 0.06, employerRothPct: 0 }] });
    expect(withMatch.successRate).toBeGreaterThanOrEqual(noMatch.successRate);
    expect(withMatch.medianEnding).toBeGreaterThan(noMatch.medianEnding);
  });
});

describe('HIGH IMPACT: Starting Balances', () => {
  it('#15 higher starting balances → higher success rate', () => {
    const low = run({
      balances: {
        traditional401k: 10000, roth401k: 0, traditionalIRA: 0,
        rothIRA: 5000, taxable: 5000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const high = run({
      balances: {
        traditional401k: 200000, roth401k: 0, traditionalIRA: 0,
        rothIRA: 100000, taxable: 100000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    expect(high.successRate).toBeGreaterThanOrEqual(low.successRate);
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding);
  });
});

describe('HIGH IMPACT: Spending', () => {
  it('#17 higher spending → lower success rate', () => {
    const low = run({ baseAnnualSpending: 3000 });
    const high = run({ baseAnnualSpending: 8000 });
    expect(low.successRate).toBeGreaterThan(high.successRate);
  });

  it('#18 higher spending inflation → lower success rate', () => {
    const low = run({ spendingInflationRate: 0.01 });
    const high = run({ spendingInflationRate: 0.05 });
    expect(low.successRate).toBeGreaterThan(high.successRate);
  });

  it('#18b inflation variability has moderate impact, not catastrophic', () => {
    const none = run({ inflationVolatility: 0 });
    const high = run({ inflationVolatility: 0.03 });
    // Variable inflation should reduce success rate somewhat
    expect(none.successRate).toBeGreaterThanOrEqual(high.successRate);
    // But not catastrophically — gap should be < 15 percentage points
    expect(none.successRate - high.successRate).toBeLessThan(0.15);
  });
});

describe('HIGH IMPACT: Income Sources', () => {
  it('#22 higher Social Security → higher success rate', () => {
    const low = run({ socialSecurityBenefit: 1000 });
    const high = run({ socialSecurityBenefit: 3500 });
    expect(high.successRate).toBeGreaterThanOrEqual(low.successRate);
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding);
  });
});

describe('HIGH IMPACT: Investment Assumptions', () => {
  // #32a–#32d vary one asset class mean at a time. Bundling all four in a single
  // test (the previous #32) could hide a hardcoded/ignored parameter because the
  // other levers still moved the result. Each test holds three asset classes
  // constant and requires a non-trivial magnitude change so a stuck value fails.
  const constantReturns = {
    stocks: { mean: 0.08, stdDev: 0.16 },
    bonds:  { mean: 0.04, stdDev: 0.06 },
    cash:   { mean: 0.02, stdDev: 0.01 },
    crypto: { mean: 0.10, stdDev: 0.50 },
  };

  it('#32a higher stocks.mean → measurably higher success rate', () => {
    const low = run({
      investments: withInvestments({
        assetClassReturns: { ...constantReturns, stocks: { mean: 0.05, stdDev: 0.16 } },
      }),
    }, 1000);
    const high = run({
      investments: withInvestments({
        assetClassReturns: { ...constantReturns, stocks: { mean: 0.15, stdDev: 0.16 } },
      }),
    }, 1000);
    expect(high.successRate - low.successRate).toBeGreaterThan(0.05);
  });

  it('#32b higher bonds.mean → measurably higher success rate', () => {
    const low = run({
      investments: withInvestments({
        assetClassReturns: { ...constantReturns, bonds: { mean: 0.01, stdDev: 0.06 } },
      }),
    }, 1000);
    const high = run({
      investments: withInvestments({
        assetClassReturns: { ...constantReturns, bonds: { mean: 0.07, stdDev: 0.06 } },
      }),
    }, 1000);
    expect(high.successRate - low.successRate).toBeGreaterThan(0.02);
  });

  it('#32c higher cash.mean → measurably higher median ending balance', () => {
    const low = run({
      investments: withInvestments({
        assetClassReturns: { ...constantReturns, cash: { mean: 0.0, stdDev: 0.01 } },
      }),
    }, 1000);
    const high = run({
      investments: withInvestments({
        assetClassReturns: { ...constantReturns, cash: { mean: 0.06, stdDev: 0.01 } },
      }),
    }, 1000);
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding * 1.01);
  });

  it('#32d higher crypto.mean → measurably higher median ending balance', () => {
    // Default risk profiles allocate 0% to crypto, so crypto.mean has no effect
    // unless the allocation is overridden. Use 20% crypto here to expose the parameter.
    const cryptoAlloc = makeUniformAllocations({ stocks: 50, bonds: 25, cash: 5, crypto: 20 });
    const low = run({
      investments: withInvestments({
        preRetirement: cryptoAlloc,
        postRetirement: cryptoAlloc,
        assetClassReturns: { ...constantReturns, crypto: { mean: 0.0, stdDev: 0.50 } },
      }),
    }, 1000);
    const high = run({
      investments: withInvestments({
        preRetirement: cryptoAlloc,
        postRetirement: cryptoAlloc,
        assetClassReturns: { ...constantReturns, crypto: { mean: 0.30, stdDev: 0.50 } },
      }),
    }, 1000);
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding * 1.02);
  });

  it('#33 higher crash frequency → lower success rate', () => {
    const lowCrash = run({
      investments: withInvestments({
        crashFrequency: 2,
      }),
    });
    const highCrash = run({
      investments: withInvestments({
        crashFrequency: 9,
      }),
    });
    expect(lowCrash.successRate).toBeGreaterThan(highCrash.successRate);
  });
});

describe('HIGH IMPACT: Withdrawal Strategy', () => {
  it('#37 different strategies produce different ending balances', () => {
    // Use a scenario with mixed account types so strategy matters
    const base: Partial<ScenarioInput> = {
      currentAge: 65,
      retirementAge: 65,
      endAge: 90,
      balances: {
        traditional401k: 400000, roth401k: 0, traditionalIRA: 100000,
        rothIRA: 200000, taxable: 100000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 4000,
      socialSecurityBenefit: 2000,
      socialSecurityClaimAge: 67,
    };
    const taxEff = run({ ...base, withdrawalStrategy: 'taxEfficient' });
    const proRata = run({ ...base, withdrawalStrategy: 'proRata' });
    // Direction depends on the interplay of RMDs, SS tax torpedo, and account
    // composition; what matters is the strategy is actually distinguishing
    // the two paths, not that one universally dominates.
    expect(Math.abs(taxEff.medianEnding - proRata.medianEnding)).toBeGreaterThan(10000);
  });
});

describe('HIGH IMPACT: Guardrails', () => {
  it('#38 guardrails enabled → higher success rate than disabled', () => {
    const base: Partial<ScenarioInput> = {
      baseAnnualSpending: 6000, // aggressive spending
      guardrails: {
        enabled: false,
        tiers: [{ drawdownPct: 15, spendingCutPct: 20 }],
      },
    };
    const disabled = run(base);
    const enabled = run({
      ...base,
      guardrails: { ...base.guardrails!, enabled: true },
    });
    expect(enabled.successRate).toBeGreaterThanOrEqual(disabled.successRate);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MEDIUM IMPACT
// ═══════════════════════════════════════════════════════════════════

describe('MEDIUM IMPACT: Profile', () => {
  it('#1 higher currentAge (fewer accumulation years) → lower success rate', () => {
    const young = run({ currentAge: 30 });
    const older = run({ currentAge: 50 });
    expect(young.successRate).toBeGreaterThanOrEqual(older.successRate);
    expect(young.medianEnding).toBeGreaterThan(older.medianEnding);
  });
});

describe('MEDIUM IMPACT: Earnings', () => {
  it('#5 higher salary growth → higher median ending balance', () => {
    const low = run({ salaryGrowthRate: 0.01 });
    const high = run({ salaryGrowthRate: 0.05 });
    expect(high.medianEnding).toBeGreaterThan(low.medianEnding);
  });

  it('#7 more Roth allocation → lower taxes in retirement (higher ending balance)', () => {
    const allTraditional = run({
      contributionAllocation: {
        traditional401k: 100, roth401k: 0, traditionalIRA: 0,
        rothIRA: 0, taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const allRoth = run({
      contributionAllocation: {
        traditional401k: 0, roth401k: 100, traditionalIRA: 0,
        rothIRA: 0, taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    // All-Roth wins on tax-free growth and avoids RMDs, so median ending
    // balance should be measurably higher than all-Traditional.
    expect(allRoth.medianEnding).toBeGreaterThan(allTraditional.medianEnding + 1000);
  });

  it('#9 higher employer match cap → higher median ending', () => {
    const lowCap = run({ jobs: [{ id: 'test', name: 'Test Job', monthlyPay: DEFAULT_SCENARIO.jobs[0].monthlyPay, startAge: DEFAULT_SCENARIO.currentAge, endAge: DEFAULT_SCENARIO.retirementAge, has401k: true, employerMatchRate: 1.0, employerMatchCapPct: 0.03, employerRothPct: 0 }] });
    const highCap = run({ jobs: [{ id: 'test', name: 'Test Job', monthlyPay: DEFAULT_SCENARIO.jobs[0].monthlyPay, startAge: DEFAULT_SCENARIO.currentAge, endAge: DEFAULT_SCENARIO.retirementAge, has401k: true, employerMatchRate: 1.0, employerMatchCapPct: 0.10, employerRothPct: 0 }] });
    expect(highCap.medianEnding).toBeGreaterThan(lowCap.medianEnding);
  });
});

describe('MEDIUM IMPACT: Contribution Limits', () => {
  it('#11 higher 401k limit → less taxable spillover → higher median ending', () => {
    // Use high savings with Roth 401k allocation where higher limit is unambiguously better
    // (Roth = tax-free growth, no RMDs — more Roth is always better than taxable)
    const base: Partial<ScenarioInput> = {
      jobs: [{ id: 'test', name: 'Test Job', monthlyPay: 15000, startAge: DEFAULT_SCENARIO.currentAge, endAge: DEFAULT_SCENARIO.retirementAge, has401k: true, employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 }],
      totalSavingsRate: 0.25,
      taxBracketInflationRate: 0, // freeze limits so the test isolates limit effects
      contributionAllocation: {
        traditional401k: 0, roth401k: 80, traditionalIRA: 0,
        rothIRA: 0, taxable: 20, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    };
    const lowLimit = run({ ...base, limit401k: 15000 });
    const highLimit = run({ ...base, limit401k: 50000 });
    // Higher limit = more in Roth 401k (tax-free) vs taxable → better outcome
    expect(highLimit.medianEnding).toBeGreaterThan(lowLimit.medianEnding);
  });
});

describe('MEDIUM IMPACT: Portfolio', () => {
  it('#16 higher cost basis pct → less capital gains tax → higher ending', () => {
    const base: Partial<ScenarioInput> = {
      currentAge: 65,
      retirementAge: 65,
      endAge: 85,
      balances: {
        traditional401k: 0, roth401k: 0, traditionalIRA: 0,
        rothIRA: 0, taxable: 800000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 4000,
      socialSecurityBenefit: 1500,
    };
    const lowBasis = run({ ...base, taxableCostBasisPct: 0.20 });
    const highBasis = run({ ...base, taxableCostBasisPct: 0.90 });
    expect(highBasis.medianEnding).toBeGreaterThan(lowBasis.medianEnding);
  });
});

describe('MEDIUM IMPACT: Income Sources', () => {
  it('#23 later SS claim age → lower success rate (fewer years of SS income)', () => {
    const early = run({ socialSecurityClaimAge: 62 });
    const late = run({ socialSecurityClaimAge: 70 });
    // Earlier claiming = more years of income during the simulation window
    expect(early.medianEnding).toBeGreaterThan(late.medianEnding);
  });

  it('#24 higher SS COLA → higher median ending', () => {
    const lowCOLA = run({ socialSecurityCOLA: 0.0 });
    const highCOLA = run({ socialSecurityCOLA: 0.04 });
    expect(highCOLA.medianEnding).toBeGreaterThan(lowCOLA.medianEnding);
  });

  it('#25 pension income → higher success rate', () => {
    const noPension = run({ pensionAmount: 0 });
    const withPension = run({ pensionAmount: 2000, pensionStartAge: 65, pensionCOLA: 0.02 });
    expect(withPension.successRate).toBeGreaterThanOrEqual(noPension.successRate);
    expect(withPension.medianEnding).toBeGreaterThan(noPension.medianEnding);
  });
});

describe('MEDIUM IMPACT: Investment Allocations', () => {
  it('#34 more equities pre-retirement → higher median ending (more growth)', () => {
    const conservative = run({
      investments: withInvestments({
        preRetirement: makeUniformAllocations({
          stocks: 30, bonds: 55, cash: 15, crypto: 0,
        }),
      }),
    });
    const aggressive = run({
      investments: withInvestments({
        preRetirement: makeUniformAllocations({
          stocks: 90, bonds: 5, cash: 5, crypto: 0,
        }),
      }),
    });
    expect(aggressive.medianEnding).toBeGreaterThan(conservative.medianEnding);
  });

  it('#35 more equities post-retirement → different ending balance', () => {
    const conservativePost = run({
      investments: withInvestments({
        postRetirement: makeUniformAllocations({
          stocks: 15, bonds: 65, cash: 20, crypto: 0,
        }),
      }),
    });
    const aggressivePost = run({
      investments: withInvestments({
        postRetirement: makeUniformAllocations({
          stocks: 80, bonds: 15, cash: 5, crypto: 0,
        }),
      }),
    });
    // Higher equity exposure post-retirement should produce a higher median
    // ending balance (equity risk premium dominates over 30y horizon).
    expect(aggressivePost.medianEnding).toBeGreaterThan(conservativePost.medianEnding + 10000);
  });

  it('#36 higher equity correlation → less diversification → lower success rate', () => {
    // We can't easily change the correlation matrix at runtime since it's a constant,
    // but we can test the effect indirectly: an all-stock allocation (no diversification)
    // vs a balanced allocation should show diversification benefit
    const allStock = run({
      investments: withInvestments({
        preRetirement: makeUniformAllocations({
          stocks: 100, bonds: 0, cash: 0, crypto: 0,
        }),
        postRetirement: makeUniformAllocations({
          stocks: 100, bonds: 0, cash: 0, crypto: 0,
        }),
      }),
    });
    const diversified = run({
      investments: withInvestments({
        preRetirement: makeUniformAllocations({
          stocks: 60, bonds: 30, cash: 10, crypto: 0,
        }),
        postRetirement: makeUniformAllocations({
          stocks: 40, bonds: 45, cash: 15, crypto: 0,
        }),
      }),
    });
    // Diversified portfolio should have higher success rate (less sequence risk)
    expect(diversified.successRate).toBeGreaterThanOrEqual(allStock.successRate);
  });
});

describe('MEDIUM IMPACT: Guardrail Parameters', () => {
  // All guardrail tests use aggressive spending to create drawdown conditions
  const guardrailBase: Partial<ScenarioInput> = {
    baseAnnualSpending: 7000, // high spending to trigger guardrails
  };

  it('#39 lower drawdown threshold → triggers sooner → more protection → higher success', () => {
    const highThreshold = run({
      ...guardrailBase,
      guardrails: {
        enabled: true,
        tiers: [{ drawdownPct: 40, spendingCutPct: 20 }],
      },
    });
    const lowThreshold = run({
      ...guardrailBase,
      guardrails: {
        enabled: true,
        tiers: [{ drawdownPct: 10, spendingCutPct: 20 }],
      },
    });
    // Lower threshold triggers sooner → cuts spending earlier → more money preserved
    expect(lowThreshold.successRate).toBeGreaterThanOrEqual(highThreshold.successRate);
  });

  it('#40 higher spending cut → more aggressive protection → higher success', () => {
    const smallCut = run({
      ...guardrailBase,
      guardrails: {
        enabled: true,
        tiers: [{ drawdownPct: 15, spendingCutPct: 5 }],
      },
    });
    const bigCut = run({
      ...guardrailBase,
      guardrails: {
        enabled: true,
        tiers: [{ drawdownPct: 15, spendingCutPct: 40 }],
      },
    });
    expect(bigCut.successRate).toBeGreaterThanOrEqual(smallCut.successRate);
  });
});

describe('MEDIUM IMPACT: Tax Rates (via scenario manipulation)', () => {
  // We can't directly change tax constants in tests, but we can test that
  // higher-income scenarios (which push into higher brackets) pay more tax
  // and have lower success rates, confirming tax brackets are wired through.

  it('#43 higher taxable income → higher effective tax → lower ending balance', () => {
    // All-traditional in a high-income scenario (hits higher brackets on withdrawal)
    const allTraditional = run({
      currentAge: 65,
      retirementAge: 65,
      endAge: 85,
      balances: {
        traditional401k: 2000000, roth401k: 0, traditionalIRA: 0,
        rothIRA: 0, taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 6000,
      socialSecurityBenefit: 2500,
    });
    // All-Roth (no tax on withdrawal)
    const allRoth = run({
      currentAge: 65,
      retirementAge: 65,
      endAge: 85,
      balances: {
        traditional401k: 0, roth401k: 0, traditionalIRA: 0,
        rothIRA: 2000000, taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 6000,
      socialSecurityBenefit: 2500,
    });
    // Roth withdrawals aren't taxed → should end with more money
    expect(allRoth.medianEnding).toBeGreaterThan(allTraditional.medianEnding);
  });
});
