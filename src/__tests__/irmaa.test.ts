import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { getIrmaaMonthlySurcharge, IRMAA_TIERS } from '../constants/irs-2026';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput, RothConversion } from '../types';

/**
 * IRMAA (Medicare income-related premium surcharges).
 *
 * Cliff tiers based on MAGI from TWO YEARS PRIOR, per person on Medicare.
 * Computed automatically when the healthcare module is enabled; the user's
 * medicareMonthly is baseline costs only (standard premiums, supplements, OOP).
 */

describe('getIrmaaMonthlySurcharge', () => {
  const tier1 = IRMAA_TIERS[0];
  const tier2 = IRMAA_TIERS[1];
  const topTier = IRMAA_TIERS[IRMAA_TIERS.length - 1];

  it('no surcharge at or below the first threshold', () => {
    expect(getIrmaaMonthlySurcharge(0, 'mfj')).toBe(0);
    expect(getIrmaaMonthlySurcharge(tier1.magiMfj, 'mfj')).toBe(0); // exactly at → not over
  });

  it('is a cliff: $1 over the threshold pays the full tier', () => {
    expect(getIrmaaMonthlySurcharge(tier1.magiMfj + 1, 'mfj')).toBe(tier1.surchargeMonthly);
  });

  it('tiers escalate with MAGI and cap at the top tier', () => {
    expect(getIrmaaMonthlySurcharge(tier2.magiMfj + 1, 'mfj')).toBe(tier2.surchargeMonthly);
    expect(getIrmaaMonthlySurcharge(10_000_000, 'mfj')).toBe(topTier.surchargeMonthly);
  });

  it('single and HOH use the single thresholds', () => {
    expect(getIrmaaMonthlySurcharge(tier1.magiSingle + 1, 'single')).toBe(tier1.surchargeMonthly);
    expect(getIrmaaMonthlySurcharge(tier1.magiSingle + 1, 'hoh')).toBe(tier1.surchargeMonthly);
    expect(getIrmaaMonthlySurcharge(tier1.magiSingle + 1, 'mfj')).toBe(0); // MFJ threshold is higher
  });

  it('threshold multiplier indexes the brackets', () => {
    const magi = tier1.magiMfj * 1.5;
    expect(getIrmaaMonthlySurcharge(magi, 'mfj', 1.0)).toBeGreaterThan(0);
    expect(getIrmaaMonthlySurcharge(magi, 'mfj', 2.0)).toBe(0); // doubled thresholds
  });
});

// ── Engine integration ──

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    socialSecurityMode: 'manual',
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 90,
    pensionAmount: 0,
    jobs: [] as ScenarioInput['jobs'],
    filingStatus: 'mfj',
    stateCode: 'TX',
    currentAge: 65, retirementAge: 65, endAge: 72,
    baseMonthlySpending: 3000, // $36k/yr
    spendingInflationRate: 0,
    inflationVolatility: 0,
    taxBracketInflationRate: 0, // freeze thresholds for exact assertions
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    // Healthcare ON with zero baseline costs — isolates the IRMAA component
    healthcare: {
      enabled: true,
      preMedicareMonthly: 0, medicareMonthly: 0, lateLifeMonthly: 0,
      medicareStartAge: 65, lateLifeStartAge: 90,
      inflationRate: 0,
    },
    spouse: {
      enabled: true, currentAge: 65, retirementAge: 65,
      socialSecurityBenefit: 0, socialSecurityClaimAge: 90,
    },
    balances: {
      traditional401k: 0, roth401k: 0, traditionalIRA: 500_000, rothIRA: 0,
      taxable: 0, hsa: 0, cashAccount: 1_000_000, otherAssets: 0,
    },
    ...overrides,
  };
}

describe('IRMAA in simulation', () => {
  it('a MAGI spike at 66 raises premiums at exactly 68 (two-year lookback), for both spouses', () => {
    // $300k conversion at 66 → MFJ tier 2 (>$274k) → surcharge lands at 68 only
    const rc: RothConversion = {
      enabled: true, strategy: 'fixedAmount', targetBracketRate: 0.12,
      fixedAnnualAmount: 300_000, startAge: 66, endAge: 66,
    };
    const result = runSimulation(makeScenario({ rothConversion: rc }), { numSimulations: 1, seed: 42 });

    const tier2Annual = IRMAA_TIERS[1].surchargeMonthly * 12 * 2; // two on Medicare
    for (const yr of result.medianPath) {
      const expected = yr.age === 68 ? 36000 + tier2Annual : 36000;
      expect(yr.spending).toBeCloseTo(expected, 0);
    }
  });

  it('cliff behavior end-to-end: conversion just under the threshold avoids the surcharge', () => {
    const under: RothConversion = {
      enabled: true, strategy: 'fixedAmount', targetBracketRate: 0.12,
      fixedAnnualAmount: IRMAA_TIERS[0].magiMfj - 1000, startAge: 66, endAge: 66,
    };
    const result = runSimulation(makeScenario({ rothConversion: under }), { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      expect(yr.spending).toBeCloseTo(36000, 0);
    }
  });

  it('only people on Medicare pay: spouse under 65 → single surcharge', () => {
    const rc: RothConversion = {
      enabled: true, strategy: 'fixedAmount', targetBracketRate: 0.12,
      fixedAnnualAmount: 300_000, startAge: 66, endAge: 66,
    };
    const scenario = makeScenario({
      rothConversion: rc,
      spouse: { enabled: true, currentAge: 55, retirementAge: 55, socialSecurityBenefit: 0, socialSecurityClaimAge: 90 },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr68 = result.medianPath.find(y => y.age === 68)!;
    expect(yr68.spending).toBeCloseTo(36000 + IRMAA_TIERS[1].surchargeMonthly * 12, 0);
  });

  it('healthcare module disabled → no IRMAA regardless of MAGI', () => {
    const rc: RothConversion = {
      enabled: true, strategy: 'fixedAmount', targetBracketRate: 0.12,
      fixedAnnualAmount: 300_000, startAge: 66, endAge: 66,
    };
    const scenario = makeScenario({
      rothConversion: rc,
      healthcare: { ...makeScenario().healthcare, enabled: false },
    });
    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      expect(yr.spending).toBeCloseTo(36000, 0);
    }
  });
});
