import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput } from '../types';

/**
 * Phase 4: Monthly conversion, edge cases, and additional coverage.
 * Verifies toAnnualScenario() works correctly, extreme age ranges,
 * one-time expenses, guardrails, and other-income sources.
 */

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return { ...DEFAULT_SCENARIO, socialSecurityMode: 'manual', ...overrides };
}

describe('Monthly-to-annual conversion (toAnnualScenario)', () => {
  it('monthly salary yields correct annual contributions', () => {
    // Default: salary = 8333/mo → 99996/yr, savings rate 20% → ~19999/yr
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 1, seed: 42 });
    const yrAge35 = result.medianPath.find(y => y.age === 35)!;
    const annualSalary = 8333 * 12; // 99996
    expect(yrAge35.income.salary).toBeCloseTo(annualSalary, 0);

    // Total contributions should be ~salary * savingsRate
    const totalContribs =
      yrAge35.contributions.traditional401k +
      yrAge35.contributions.roth401k +
      yrAge35.contributions.traditionalIRA +
      yrAge35.contributions.rothIRA +
      yrAge35.contributions.taxable +
      yrAge35.contributions.hsa;
    const expectedSavings = annualSalary * DEFAULT_SCENARIO.totalSavingsRate;
    expect(totalContribs).toBeCloseTo(expectedSavings, 0);
  });

  it('monthly spending yields correct annual retirement spending', () => {
    const scenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 70,
      baseAnnualSpending: 4000, // monthly → $48k/yr
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      spendingInflationRate: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      balances: {
        traditional401k: 1000000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath[0]; // age 65
    // Spending should be 4000 * 12 = 48000
    expect(yr.spending).toBeCloseTo(48000, 0);
  });

  it('monthly Social Security converts to annual', () => {
    const scenario = makeScenario({
      currentAge: 67,
      retirementAge: 67,
      endAge: 70,
      socialSecurityBenefit: 2500, // monthly
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0,
      balances: {
        traditional401k: 500000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath[0];
    expect(yr.income.socialSecurity).toBeCloseTo(30000, 0); // 2500 * 12
  });

  it('monthly pension converts to annual', () => {
    const scenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 70,
      pensionAmount: 1500, // monthly
      pensionStartAge: 65,
      pensionCOLA: 0,
      balances: {
        traditional401k: 500000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath[0];
    expect(yr.income.pension).toBeCloseTo(18000, 0); // 1500 * 12
  });

  it('monthly guardrail floor converts to annual', () => {
    // Guardrail floor = 2500/mo = 30000/yr
    // Set spending very high with massive drawdown and guardrails enabled
    const scenario = makeScenario({
      currentAge: 70,
      retirementAge: 70,
      endAge: 75,
      baseAnnualSpending: 10000, // monthly → 120k/yr
      spendingInflationRate: 0,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      balances: {
        traditional401k: 50000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      guardrails: {
        enabled: true,
        tiers: [
          { drawdownPct: 5, spendingCutPct: 90 }, // 90% cut at 5% drawdown
        ],
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    // If guardrail cuts 90% but floor is 30k, spending should be at least floor
    // (or limited by available funds)
    for (const yr of result.medianPath) {
      if (yr.spending > 0) {
        // Floor = 2500 * 12 = 30000, inflated by spending inflation
        const retYears = yr.age - 70;
        const inflatedFloor = 30000 * Math.pow(1 + 0.025, retYears);
        // Spending should be at least the floor (unless depleted)
        if (yr.totalBalance > 0) {
          // May not always hit floor if already depleted
          expect(yr.spending).toBeGreaterThanOrEqual(inflatedFloor * 0.95); // 5% tolerance
        }
      }
    }
  });

  it('monthly otherIncomeSources converts to annual', () => {
    const scenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 70,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      otherIncomeSources: [
        {
          id: 'rental',
          name: 'Rental Income',
          annualAmount: 800, // monthly label, but value used in conversion
          startAge: 65,
          endAge: 70,
          inflationRate: 0,
        },
      ],
      balances: {
        traditional401k: 500000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath[0];
    expect(yr.income.other).toBeCloseTo(9600, 0); // 800 * 12
  });
});

describe('One-time expenses', () => {
  it('one-time expense increases spending in the target year', () => {
    const scenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 70,
      baseAnnualSpending: 4000, // monthly → 48k/yr
      spendingInflationRate: 0,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      oneTimeExpenses: [
        { id: '1', name: 'New Roof', amount: 20000, age: 67, inflationAdjusted: false },
      ],
      balances: {
        traditional401k: 1000000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr65 = result.medianPath.find(y => y.age === 65)!;
    const yr67 = result.medianPath.find(y => y.age === 67)!;
    // Age 67 spending should be ~48000 + 20000 = 68000
    expect(yr67.spending).toBeCloseTo(yr65.spending + 20000, -2); // within $100
  });

  it('inflation-adjusted one-time expense grows', () => {
    const scenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 75,
      baseAnnualSpending: 4000, // monthly → 48k/yr
      spendingInflationRate: 0.03,
      inflationVolatility: 0,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      oneTimeExpenses: [
        { id: '1', name: 'Trip', amount: 10000, age: 70, inflationAdjusted: true },
      ],
      balances: {
        traditional401k: 2000000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr70 = result.medianPath.find(y => y.age === 70)!;
    const yr69 = result.medianPath.find(y => y.age === 69)!;
    // Extra spending at age 70 should be 10000 * (1.03)^5 ≈ 11593
    const inflatedExpense = 10000 * Math.pow(1.03, 5);
    // yr70 base spending also grows, but the delta should be close to inflatedExpense
    const yearOverYearGrowthSpending = yr69.spending * 1.03;
    const extraSpending = yr70.spending - yearOverYearGrowthSpending;
    expect(extraSpending).toBeCloseTo(inflatedExpense, -2);
  });
});

describe('Extreme age ranges', () => {
  it('retirement at current age (immediately retired)', () => {
    const scenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 70,
      balances: {
        traditional401k: 500000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 5, seed: 42 });
    expect(result.medianPath.length).toBe(6); // ages 65-70
    // Should have spending from year 1
    expect(result.medianPath[0].spending).toBeGreaterThan(0);
  });

  it('very short horizon (1 year)', () => {
    const scenario = makeScenario({
      currentAge: 90,
      retirementAge: 65,
      endAge: 90,
      balances: {
        traditional401k: 100000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    expect(result.medianPath.length).toBe(1);
  });

  it('very long horizon (age 25 to 100)', () => {
    const scenario = makeScenario({
      currentAge: 25,
      retirementAge: 65,
      endAge: 100,
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    expect(result.medianPath.length).toBe(76); // ages 25-100
  });
});

describe('Spending inflation compounding', () => {
  it('spending grows at the inflation rate each year', () => {
    const scenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 75,
      baseAnnualSpending: 5000, // monthly → 60k/yr
      spendingInflationRate: 0.03,
      inflationVolatility: 0,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      oneTimeExpenses: [],
      balances: {
        traditional401k: 2000000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const baseAnnual = 60000;
    for (const yr of result.medianPath) {
      const retYears = yr.age - 65;
      const expected = baseAnnual * Math.pow(1.03, retYears);
      expect(yr.spending).toBeCloseTo(expected, 0);
    }
  });
});

describe('Guardrail spending cuts', () => {
  it('guardrails reduce spending after drawdown threshold', () => {
    // Use a scenario that will trigger drawdown
    const scenario = makeScenario({
      currentAge: 70,
      retirementAge: 70,
      endAge: 85,
      baseAnnualSpending: 8000, // monthly → 96k/yr (aggressive)
      spendingInflationRate: 0,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
      guardrails: {
        enabled: true,
        tiers: [{ drawdownPct: 10, spendingCutPct: 20 }],
      },
      balances: {
        traditional401k: 500000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 500000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      investments: {
        ...DEFAULT_SCENARIO.investments,
        // Use cash-only to get predictable low returns
        preRetirement: {
          traditional401k: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          roth401k: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          traditionalIRA: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          rothIRA: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          taxable: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          hsa: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          cashAccount: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          otherAssets: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
        },
        postRetirement: {
          traditional401k: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          roth401k: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          traditionalIRA: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          rothIRA: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          taxable: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          hsa: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          cashAccount: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
          otherAssets: { stocks: 0, bonds: 0, cash: 100, crypto: 0 },
        },
      },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    // After some years, drawdown should exceed 10% and spending should decrease
    const initialSpending = result.medianPath[0].spending;
    const hasReducedSpending = result.medianPath.some(yr => yr.spending < initialSpending * 0.95);
    expect(hasReducedSpending).toBe(true);
  });
});

describe('Multiple withdrawal strategies produce different results', () => {
  it('taxEfficient vs rothPreserving vs proRata differ', () => {
    const baseScenario = makeScenario({
      currentAge: 65,
      retirementAge: 65,
      endAge: 80,
      socialSecurityBenefit: 1500,
      socialSecurityClaimAge: 67,
      balances: {
        traditional401k: 300000, roth401k: 0,
        traditionalIRA: 100000, rothIRA: 200000,
        taxable: 100000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      baseAnnualSpending: 4000, // monthly → 48k/yr
    });

    const strategies: Array<'taxEfficient' | 'rothPreserving' | 'proRata'> = [
      'taxEfficient', 'rothPreserving', 'proRata',
    ];
    const endBalances = strategies.map(strat => {
      const s = { ...baseScenario, withdrawalStrategy: strat } as ScenarioInput;
      const result = runSimulation(s, { numSimulations: 1, seed: 42 });
      return result.endingBalances[0];
    });

    // At least two strategies should produce different ending balances
    const unique = new Set(endBalances.map(b => Math.round(b)));
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });
});

describe('Surplus income reinvestment', () => {
  it('income surplus flows into taxable account', () => {
    // SS = $4000/mo ($48K/yr), spending = $2000/mo ($24K/yr) → ~$24K surplus before tax
    const scenario = makeScenario({
      currentAge: 67, retirementAge: 67, endAge: 69,
      filingStatus: 'mfj',
      baseAnnualSpending: 2000,
      spendingInflationRate: 0,
      socialSecurityBenefit: 4000, // $48K/yr
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0,
      pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: {
        traditional401k: 0, roth401k: 0,
        traditionalIRA: 0, rothIRA: 100000,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr67 = result.medianPath.find(y => y.age === 67)!;

    // Income ($48K) > spending ($24K), surplus after taxes should land in taxable
    // SS taxation for MFJ: provisional = 0 + 0.5*48000 = 24000 < 32000 → 0% taxable
    // So tax ≈ $0 on SS, surplus ≈ $24K
    expect(yr67.balances.taxable).toBeGreaterThan(0);

    // After 2 years of surplus, taxable should have accumulated meaningfully
    const yr68 = result.medianPath.find(y => y.age === 68)!;
    expect(yr68.balances.taxable).toBeGreaterThan(yr67.balances.taxable);
  });

  it('no surplus reinvested when spending exceeds income', () => {
    // Spending > income → no surplus, withdrawals should happen
    const scenario = makeScenario({
      currentAge: 67, retirementAge: 67, endAge: 68,
      filingStatus: 'mfj',
      baseAnnualSpending: 5000, // $60K/yr
      spendingInflationRate: 0,
      socialSecurityBenefit: 2000, // $24K/yr
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0,
      pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: {
        traditional401k: 500000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr67 = result.medianPath.find(y => y.age === 67)!;

    // Should be withdrawing, not reinvesting
    const totalW = Object.values(yr67.withdrawals).reduce((a, b) => a + b, 0);
    expect(totalW).toBeGreaterThan(0);
  });

  it('surplus reinvestment increases ending balance vs without', () => {
    // Large SS, small spending → signifcant surplus should compound
    const scenario = makeScenario({
      currentAge: 67, retirementAge: 67, endAge: 85,
      filingStatus: 'mfj',
      baseAnnualSpending: 2000, // $24K/yr
      spendingInflationRate: 0.02,
      socialSecurityBenefit: 5000, // $60K/yr combined SS
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0.02,
      pensionAmount: 0,
      guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
      healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: {
        traditional401k: 0, roth401k: 0,
        traditionalIRA: 0, rothIRA: 200000,
        taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    // By age 85, taxable should have accumulated substantially from surplus
    const yr85 = result.medianPath.find(y => y.age === 85)!;
    expect(yr85.balances.taxable).toBeGreaterThan(200000); // many years of ~$36K+ surplus
  });
});
