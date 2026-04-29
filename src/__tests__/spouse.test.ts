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
      spouse: { enabled: false, currentAge: 33, socialSecurityBenefit: 1500, socialSecurityClaimAge: 67 },
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
