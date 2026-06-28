import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput, SpouseConfig } from '../types';

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return { ...DEFAULT_SCENARIO, socialSecurityMode: 'manual', ...overrides };
}

const DISABLED_GUARDRAILS = { ...DEFAULT_SCENARIO.guardrails, enabled: false };
const DISABLED_HEALTHCARE = { ...DEFAULT_SCENARIO.healthcare, enabled: false };
const DISABLED_ROTH = { ...DEFAULT_SCENARIO.rothConversion, enabled: false };
const DISABLED_BUFFER = { ...DEFAULT_SCENARIO.cashBuffer, enabled: false };

describe('Spouse config', () => {
  it('disabled spouse has no effect on simulation', () => {
    const base = {
      currentAge: 65, retirementAge: 65, endAge: 70,
      jobs: [] as ScenarioInput['jobs'],
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 2000, socialSecurityClaimAge: 65,
      pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      balances: { ...DEFAULT_SCENARIO.balances, taxable: 500000 },
    };

    const withSpouseOff = makeScenario({
      ...base,
      spouse: { enabled: false, currentAge: 33, socialSecurityBenefit: 1500, retirementAge: 65, socialSecurityClaimAge: 67 },
    });
    const r1 = runSimulation(withSpouseOff, { numSimulations: 1, seed: 42 });

    const withoutSpouse = makeScenario(base);
    const r2 = runSimulation(withoutSpouse, { numSimulations: 1, seed: 42 });

    for (let i = 0; i < r1.medianPath.length; i++) {
      expect(r1.medianPath[i].totalBalance).toBeCloseTo(r2.medianPath[i].totalBalance, 0);
    }
  });

  it('spouse enabled produces valid simulation results', () => {
    const sp: SpouseConfig = {
      enabled: true,
      currentAge: 63,
      retirementAge: 65,
      socialSecurityBenefit: 1500,
      socialSecurityClaimAge: 67,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 70,
      jobs: [] as ScenarioInput['jobs'],
      baseAnnualSpending: 4000, spendingInflationRate: 0,
      socialSecurityBenefit: 2000, socialSecurityClaimAge: 65,
      socialSecurityCOLA: 0.02,
      pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      spouse: sp,
      balances: { ...DEFAULT_SCENARIO.balances, taxable: 500000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    expect(result.medianPath.length).toBe(6); // ages 65-70
    expect(result.successRate).toBeGreaterThanOrEqual(0);
  });

  it('multi-simulation run with spouse enabled produces valid results', () => {
    const sp: SpouseConfig = {
      enabled: true,
      currentAge: 58,
      retirementAge: 65,
      socialSecurityBenefit: 1500,
      socialSecurityClaimAge: 67,
    };

    const scenario = makeScenario({
      currentAge: 60, retirementAge: 62, endAge: 90,
      filingStatus: 'mfj',
      baseAnnualSpending: 6000, spendingInflationRate: 0.025,
      socialSecurityBenefit: 2500, socialSecurityClaimAge: 67,
      pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      spouse: sp,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000, rothIRA: 200000, taxable: 300000 },
    });

    const result = runSimulation(scenario, { numSimulations: 100, seed: 123 });
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    expect(result.percentileBands.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SPOUSE INCOME (jobs owned by spouse)
// ═══════════════════════════════════════════════════════════════════

function medianEnding(balances: number[]): number {
  const sorted = [...balances].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('Spouse income (owner-aware jobs)', () => {
  const baseAccum = (overrides: Partial<ScenarioInput> = {}): ScenarioInput =>
    makeScenario({
      currentAge: 55, retirementAge: 65, endAge: 80,
      filingStatus: 'mfj',
      baseAnnualSpending: 4000, spendingInflationRate: 0,
      socialSecurityBenefit: 2000, socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0,
      totalSavingsRate: 0.20,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      jobs: [
        { id: 'p1', name: 'Primary', owner: 'primary', monthlyPay: 6000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
      ],
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 300000, taxable: 100000 },
      ...overrides,
    });

  it('adding a spouse job raises median ending balance', () => {
    const sp: SpouseConfig = { enabled: true, currentAge: 55, retirementAge: 65,
      socialSecurityBenefit: 1500, socialSecurityClaimAge: 67 };

    const withoutSpouseJob = runSimulation(baseAccum({ spouse: sp }),
      { numSimulations: 50, seed: 7 });
    const withSpouseJob = runSimulation(baseAccum({
      spouse: sp,
      jobs: [
        { id: 'p1', name: 'Primary', owner: 'primary', monthlyPay: 6000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
        { id: 's1', name: 'Spouse', owner: 'spouse', monthlyPay: 5000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
      ],
    }), { numSimulations: 50, seed: 7 });

    expect(medianEnding(withSpouseJob.endingBalances))
      .toBeGreaterThan(medianEnding(withoutSpouseJob.endingBalances));
  });

  it("spouse's job ends at its own endAge, not the household retirement age", () => {
    // Spouse job runs past primary's retirement age — should still contribute.
    const sp: SpouseConfig = { enabled: true, currentAge: 55, retirementAge: 70,
      socialSecurityBenefit: 1500, socialSecurityClaimAge: 67 };

    const earlyStop = runSimulation(baseAccum({
      spouse: sp,
      jobs: [
        { id: 'p1', name: 'Primary', owner: 'primary', monthlyPay: 6000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
        { id: 's1', name: 'Spouse short', owner: 'spouse', monthlyPay: 5000,
          startAge: 55, endAge: 60, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
      ],
    }), { numSimulations: 50, seed: 11 });

    const lateStop = runSimulation(baseAccum({
      spouse: sp,
      jobs: [
        { id: 'p1', name: 'Primary', owner: 'primary', monthlyPay: 6000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
        { id: 's1', name: 'Spouse long', owner: 'spouse', monthlyPay: 5000,
          startAge: 55, endAge: 70, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
      ],
    }), { numSimulations: 50, seed: 11 });

    // Ten more years of spouse income must increase the median.
    expect(medianEnding(lateStop.endingBalances))
      .toBeGreaterThan(medianEnding(earlyStop.endingBalances));
  });

  it('per-owner 401(k) limit: two earners contribute more than one earner can', () => {
    // Two high earners should pierce the single-person 401(k) cap collectively.
    // Use a 100% savings rate so contributions are fully limit-bound, not
    // income-bound.
    const oneEarner = runSimulation(baseAccum({
      totalSavingsRate: 1.0,
      contributionAllocation: { traditional401k: 100, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0 },
      jobs: [
        { id: 'p1', name: 'Primary', owner: 'primary', monthlyPay: 20000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
      ],
    }), { numSimulations: 1, seed: 1 });

    const twoEarners = runSimulation(baseAccum({
      totalSavingsRate: 1.0,
      contributionAllocation: { traditional401k: 100, roth401k: 0,
        traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0,
        cashAccount: 0, otherAssets: 0 },
      spouse: { enabled: true, currentAge: 55, retirementAge: 65,
        socialSecurityBenefit: 1500, socialSecurityClaimAge: 67 },
      jobs: [
        { id: 'p1', name: 'Primary', owner: 'primary', monthlyPay: 20000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
        { id: 's1', name: 'Spouse', owner: 'spouse', monthlyPay: 20000,
          startAge: 55, endAge: 65, has401k: true,
          employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
      ],
    }), { numSimulations: 1, seed: 1 });

    expect(medianEnding(twoEarners.endingBalances))
      .toBeGreaterThan(medianEnding(oneEarner.endingBalances) * 1.5);
  });

  it('spouse SS earnings test reduces benefit when spouse works pre-FRA', () => {
    // Spouse claims early (age 62) while still working. Compare a low-earning
    // spouse job vs. a high-earning one; high earnings trigger the SS earnings
    // test → smaller early-year SS receipts.
    const makeSp = (): SpouseConfig => ({
      enabled: true, currentAge: 62, retirementAge: 67,
      socialSecurityBenefit: 2500, socialSecurityClaimAge: 62,
    });

    const buildScenario = (spouseMonthlyPay: number): ScenarioInput =>
      makeScenario({
        currentAge: 67, retirementAge: 67, endAge: 80,
        filingStatus: 'mfj',
        baseAnnualSpending: 5000, spendingInflationRate: 0,
        socialSecurityBenefit: 2500, socialSecurityClaimAge: 67,
        socialSecurityCOLA: 0,
        guardrails: DISABLED_GUARDRAILS,
        healthcare: DISABLED_HEALTHCARE,
        rothConversion: DISABLED_ROTH,
        cashBuffer: DISABLED_BUFFER,
        spouse: makeSp(),
        jobs: [
          { id: 's1', name: 'Spouse', owner: 'spouse', monthlyPay: spouseMonthlyPay,
            startAge: 62, endAge: 66, has401k: false,
            employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
        ],
        balances: { ...DEFAULT_SCENARIO.balances, taxable: 800000 },
      });

    const lowEarn = runSimulation(buildScenario(1000), { numSimulations: 50, seed: 33 });
    const highEarn = runSimulation(buildScenario(15000), { numSimulations: 50, seed: 33 });

    // Compare SS receipts during the spouse's pre-FRA working years (first
    // 5 path entries, ages 67-71 of primary = spouse ages 62-66).
    const lowSS = lowEarn.medianPath.slice(0, 5)
      .reduce((s, y) => s + (y.income?.socialSecurity ?? 0), 0);
    const highSS = highEarn.medianPath.slice(0, 5)
      .reduce((s, y) => s + (y.income?.socialSecurity ?? 0), 0);
    expect(highSS).toBeLessThan(lowSS);
  });
});

