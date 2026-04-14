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

describe('Spouse income', () => {
  it('disabled spouse has no effect on simulation', () => {
    const base = {
      currentAge: 65, retirementAge: 65, endAge: 70,
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
      spouse: { ...DEFAULT_SCENARIO.spouse, enabled: false },
    });
    const r1 = runSimulation(withSpouseOff, { numSimulations: 1, seed: 42 });

    const withoutSpouse = makeScenario(base);
    const r2 = runSimulation(withoutSpouse, { numSimulations: 1, seed: 42 });

    for (let i = 0; i < r1.medianPath.length; i++) {
      expect(r1.medianPath[i].totalBalance).toBeCloseTo(r2.medianPath[i].totalBalance, 0);
    }
  });

  it('spouse SS increases total income when claimed', () => {
    const sp: SpouseConfig = {
      enabled: true,
      currentAge: 63,
      retirementAge: 63,
      currentSalary: 0,
      salaryGrowthRate: 0,
      socialSecurityBenefit: 1500,   // monthly
      socialSecurityClaimAge: 65,
      pensionAmount: 0,
      pensionStartAge: 65,
      pensionCOLA: 0,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 70,
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

    // At age 65: primary SS = $2000×12 = $24000, spouse age = 63 (not yet claimed)
    const yr0 = result.medianPath.find(y => y.age === 65)!;
    expect(yr0.income.socialSecurity).toBeCloseTo(24000, -1);

    // At age 67: primary SS grows with COLA, spouse age = 65 → now claiming $1500×12
    const yr2 = result.medianPath.find(y => y.age === 67)!;
    expect(yr2.income.socialSecurity).toBeGreaterThan(24000 + 17000); // primary + spouse combined
  });

  it('spouse salary contributes to savings during accumulation', () => {
    const sp: SpouseConfig = {
      enabled: true,
      currentAge: 33,
      retirementAge: 65,
      currentSalary: 5000,  // $5000/mo
      salaryGrowthRate: 0.03,
      socialSecurityBenefit: 1500,
      socialSecurityClaimAge: 67,
      pensionAmount: 0,
      pensionStartAge: 65,
      pensionCOLA: 0,
    };

    const withSpouse = makeScenario({
      currentAge: 35, retirementAge: 65, endAge: 70,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 2000, socialSecurityClaimAge: 67,
      pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      spouse: sp,
      balances: { ...DEFAULT_SCENARIO.balances, taxable: 50000 },
    });

    const withoutSpouse = makeScenario({
      currentAge: 35, retirementAge: 65, endAge: 70,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 2000, socialSecurityClaimAge: 67,
      pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      spouse: { ...DEFAULT_SCENARIO.spouse, enabled: false },
      balances: { ...DEFAULT_SCENARIO.balances, taxable: 50000 },
    });

    const r1 = runSimulation(withSpouse, { numSimulations: 1, seed: 42 });
    const r2 = runSimulation(withoutSpouse, { numSimulations: 1, seed: 42 });

    // Spouse earning $5000/mo × 20% savings = $1000/mo × 12 = $12,000/yr extra savings
    // After 30 years of accumulation, should have significantly more
    const endWithSpouse = r1.medianPath[r1.medianPath.length - 1].totalBalance;
    const endWithout = r2.medianPath[r2.medianPath.length - 1].totalBalance;
    expect(endWithSpouse).toBeGreaterThan(endWithout);
  });

  it('spouse pension activates at spouse pension start age', () => {
    const sp: SpouseConfig = {
      enabled: true,
      currentAge: 60,
      retirementAge: 60,
      currentSalary: 0,
      salaryGrowthRate: 0,
      socialSecurityBenefit: 0,
      socialSecurityClaimAge: 70,
      pensionAmount: 1000,       // $1000/mo
      pensionStartAge: 62,
      pensionCOLA: 0,
    };

    const scenario = makeScenario({
      currentAge: 62, retirementAge: 62, endAge: 67,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, socialSecurityClaimAge: 70,
      pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      spouse: sp,
      balances: { ...DEFAULT_SCENARIO.balances, taxable: 500000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    // At age 62: primary age 62, spouse age 60 → pension not active yet
    const yr0 = result.medianPath.find(y => y.age === 62)!;
    expect(yr0.income.pension).toBe(0);

    // At age 64: spouse age 62 → pension starts ($1000×12 = $12000)
    const yr2 = result.medianPath.find(y => y.age === 64)!;
    expect(yr2.income.pension).toBeCloseTo(12000, 0);
  });

  it('spouse with different retirement age keeps working after primary retires', () => {
    const sp: SpouseConfig = {
      enabled: true,
      currentAge: 58,
      retirementAge: 63,       // retires 5 years later
      currentSalary: 4000,     // $4000/mo
      salaryGrowthRate: 0,
      socialSecurityBenefit: 1500,
      socialSecurityClaimAge: 67,
      pensionAmount: 0,
      pensionStartAge: 65,
      pensionCOLA: 0,
    };

    const scenario = makeScenario({
      currentAge: 60, retirementAge: 60, endAge: 67,
      baseAnnualSpending: 5000, spendingInflationRate: 0,
      socialSecurityBenefit: 2000, socialSecurityClaimAge: 67,
      pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: DISABLED_ROTH,
      cashBuffer: DISABLED_BUFFER,
      spouse: sp,
      balances: { ...DEFAULT_SCENARIO.balances, taxable: 800000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    // At age 60: primary retired, spouse age 58 (still working) → salary income
    const yr0 = result.medianPath.find(y => y.age === 60)!;
    expect(yr0.income.salary).toBeCloseTo(4000 * 12, 0);

    // At age 65: spouse age 63 (now retired) → no salary
    const yr5 = result.medianPath.find(y => y.age === 65)!;
    expect(yr5.income.salary).toBe(0);
  });

  it('multi-simulation run with spouse enabled produces valid results', () => {
    const sp: SpouseConfig = {
      enabled: true,
      currentAge: 58,
      retirementAge: 62,
      currentSalary: 5000,
      salaryGrowthRate: 0.03,
      socialSecurityBenefit: 2000,
      socialSecurityClaimAge: 67,
      pensionAmount: 500,
      pensionStartAge: 62,
      pensionCOLA: 0.01,
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
