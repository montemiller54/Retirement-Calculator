import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput, YearResult, RothConversion } from '../types';

/**
 * Early-withdrawal penalty tests (10% before 59½; engine approximates at age 60).
 *
 * IRS rules encoded here:
 *  - Traditional 401k/IRA withdrawals before 59½ are penalized (Rule of 55 exempts 401k).
 *  - A Roth CONVERSION is never itself penalized (only tax-withheld portions would be,
 *    and this engine always converts the full amount).
 *  - Roth IRA withdrawals follow ordering: contribution basis (penalty-free) →
 *    conversions oldest-first (penalized only if < 5 years old) → earnings (penalized).
 *  - Each withdrawn dollar is penalized at most once, and basis/conversion layers
 *    are consumed as they are withdrawn.
 */

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    socialSecurityMode: 'manual',
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 90,
    pensionAmount: 0,
    jobs: [] as ScenarioInput['jobs'],
    spendingInflationRate: 0,
    inflationVolatility: 0,
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    rothContributionBasis: 0,
    balances: {
      traditional401k: 0, roth401k: 0, traditionalIRA: 0, rothIRA: 0,
      taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0,
    },
    ...overrides,
  };
}

// taxes.total = federal + state + fica + earlyWithdrawalPenalty
function penaltyOf(yr: YearResult): number {
  return yr.taxes.total - yr.taxes.federal - yr.taxes.state - yr.taxes.fica;
}

describe('Traditional account penalties (regression)', () => {
  it('traditional IRA withdrawals before 59½ incur exactly 10%', () => {
    const scenario = makeScenario({
      currentAge: 50, retirementAge: 50, endAge: 55,
      baseMonthlySpending: 4000, // monthly → $48k/yr
      balances: { ...makeScenario().balances, traditionalIRA: 1_000_000 },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      const tradW = yr.withdrawals.traditionalIRA + yr.withdrawals.traditional401k;
      if (yr.age < 60) {
        expect(tradW).toBeGreaterThan(0);
        expect(penaltyOf(yr)).toBeCloseTo(0.10 * tradW, 0);
      }
    }
  });

  it('Rule of 55 exempts 401k withdrawals at 55+, but ineligibility does not', () => {
    const base = makeScenario({
      currentAge: 55, retirementAge: 55, endAge: 59,
      baseMonthlySpending: 4000,
      balances: { ...makeScenario().balances, traditional401k: 1_000_000 },
    });

    const eligible = runSimulation({ ...base, ruleof55Eligible: true }, { numSimulations: 1, seed: 42 });
    for (const yr of eligible.medianPath) {
      expect(penaltyOf(yr)).toBeCloseTo(0, 0);
    }

    const ineligible = runSimulation({ ...base, ruleof55Eligible: false }, { numSimulations: 1, seed: 42 });
    for (const yr of ineligible.medianPath) {
      expect(penaltyOf(yr)).toBeCloseTo(0.10 * yr.withdrawals.traditional401k, 0);
      expect(yr.withdrawals.traditional401k).toBeGreaterThan(0);
    }
  });

  it('no penalty at age 60+', () => {
    const scenario = makeScenario({
      currentAge: 60, retirementAge: 60, endAge: 65,
      baseMonthlySpending: 4000,
      balances: { ...makeScenario().balances, traditionalIRA: 1_000_000 },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      expect(penaltyOf(yr)).toBeCloseTo(0, 0);
    }
  });
});

describe('Roth conversions and the 10% penalty', () => {
  it('a conversion by itself incurs no penalty (full amount is converted, nothing distributed)', () => {
    const rc: RothConversion = {
      enabled: true, strategy: 'fixedAmount', targetBracketRate: 0.12,
      fixedAnnualAmount: 50000, startAge: 50, endAge: 52,
    };
    const scenario = makeScenario({
      currentAge: 50, retirementAge: 50, endAge: 54,
      baseMonthlySpending: 0,
      rothConversion: rc,
      // Cash covers the conversion's income tax, so no penalizable withdrawals occur
      balances: { ...makeScenario().balances, traditional401k: 500_000, cashAccount: 300_000 },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      if (yr.rothConversionAmount > 0) {
        // Conversion is taxed as ordinary income but NOT penalized
        expect(yr.taxes.federal).toBeGreaterThan(0);
      }
      expect(penaltyOf(yr)).toBeCloseTo(0, 0);
    }
  });

  it('withdrawing a recent conversion is penalized exactly once (no double counting)', () => {
    const rc: RothConversion = {
      enabled: true, strategy: 'fixedAmount', targetBracketRate: 0.12,
      fixedAnnualAmount: 100_000, startAge: 50, endAge: 50,
    };
    const scenario = makeScenario({
      currentAge: 50, retirementAge: 50, endAge: 53,
      baseMonthlySpending: 2500, // $30k/yr, funded from the freshly converted Roth IRA
      rothConversion: rc,
      balances: { ...makeScenario().balances, traditionalIRA: 100_000 },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    let sawRothWithdrawal = false;
    for (const yr of result.medianPath) {
      const w = yr.withdrawals.rothIRA;
      if (w > 0 && yr.age < 60) {
        sawRothWithdrawal = true;
        // Basis is 0 and every dollar is either a <5y conversion or earnings:
        // both penalized, but only ONCE — never the conversion amount on top.
        expect(penaltyOf(yr)).toBeCloseTo(0.10 * w, 0);
      }
    }
    expect(sawRothWithdrawal).toBe(true);
  });

  it('conversions aged 5+ years come out penalty-free; earnings beyond layers are penalized', () => {
    const rc: RothConversion = {
      enabled: true, strategy: 'fixedAmount', targetBracketRate: 0.12,
      fixedAnnualAmount: 50_000, startAge: 50, endAge: 50,
    };
    const scenario = makeScenario({
      currentAge: 50, retirementAge: 50, endAge: 59,
      baseMonthlySpending: 2500, // $30k/yr
      rothConversion: rc,
      // Cash funds early years so Roth withdrawals start after the layer has aged
      balances: { ...makeScenario().balances, traditionalIRA: 50_000, cashAccount: 170_000 },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    // Replay the layer ledger from reported withdrawals
    let layerRemaining = 50_000; // converted at age 50
    let sawRothWithdrawal = false;
    for (const yr of result.medianPath) {
      const w = yr.withdrawals.rothIRA;
      if (w <= 0 || yr.age >= 60) continue;
      sawRothWithdrawal = true;
      const fromLayer = Math.min(w, layerRemaining);
      layerRemaining -= fromLayer;
      const layerPenalized = yr.age - 50 < 5 ? fromLayer : 0;
      const earningsPenalized = w - fromLayer;
      expect(penaltyOf(yr)).toBeCloseTo(0.10 * (layerPenalized + earningsPenalized), 0);
    }
    expect(sawRothWithdrawal).toBe(true);
  });

  it('contribution basis comes out first, penalty-free, and is consumed across years', () => {
    const scenario = makeScenario({
      currentAge: 50, retirementAge: 50, endAge: 55,
      baseMonthlySpending: 3000, // $36k/yr
      rothContributionBasis: 60_000,
      balances: { ...makeScenario().balances, rothIRA: 500_000 },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    let basisRemaining = 60_000;
    let sawPenalizedYear = false;
    for (const yr of result.medianPath) {
      const w = yr.withdrawals.rothIRA;
      if (w <= 0 || yr.age >= 60) continue;
      const fromBasis = Math.min(w, basisRemaining);
      basisRemaining -= fromBasis;
      const expected = 0.10 * (w - fromBasis); // no conversions → beyond basis is earnings
      if (expected > 0) sawPenalizedYear = true;
      expect(penaltyOf(yr)).toBeCloseTo(expected, 0);
    }
    // With $36k/yr against $60k basis, year 2 must exceed remaining basis
    expect(sawPenalizedYear).toBe(true);
  });
});
