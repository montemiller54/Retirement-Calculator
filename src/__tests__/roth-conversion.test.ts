import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import { FEDERAL_BRACKETS_MFJ, STANDARD_DEDUCTION_MFJ } from '../constants/tax';
import type { ScenarioInput, RothConversion } from '../types';

const MFJ_12PCT_CEILING = FEDERAL_BRACKETS_MFJ[1].max + STANDARD_DEDUCTION_MFJ;

function makeScenario(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return { ...DEFAULT_SCENARIO, ...overrides };
}

const DISABLED_GUARDRAILS = { ...DEFAULT_SCENARIO.guardrails, enabled: false };
const DISABLED_HEALTHCARE = { ...DEFAULT_SCENARIO.healthcare, enabled: false };

describe('Roth conversions', () => {
  it('disabled conversion moves no money', () => {
    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 70,
      baseAnnualSpending: 3000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000, rothIRA: 100000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    for (const yr of result.medianPath) {
      expect(yr.rothConversionAmount).toBe(0);
    }
  });

  it('fixedAmount converts specified amount each year', () => {
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 30000,
      startAge: 65,
      endAge: 68,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 70,
      baseAnnualSpending: 1000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000, rothIRA: 0, taxable: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    // Ages 65-68: should convert 30000/yr
    for (let age = 65; age <= 68; age++) {
      const yr = result.medianPath.find(y => y.age === age)!;
      expect(yr.rothConversionAmount).toBeCloseTo(30000, 0);
    }
    // Age 69-70: outside window
    for (let age = 69; age <= 70; age++) {
      const yr = result.medianPath.find(y => y.age === age)!;
      expect(yr.rothConversionAmount).toBe(0);
    }
  });

  it('fixedAmount is capped by available traditional balance', () => {
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 200000,
      startAge: 65,
      endAge: 67,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 67,
      jobs: [] as ScenarioInput['jobs'],
      baseAnnualSpending: 0, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 100000, traditionalIRA: 50000, rothIRA: 0, taxable: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr65 = result.medianPath.find(y => y.age === 65)!;
    // Can only convert what's available: 150000
    expect(yr65.rothConversionAmount).toBeCloseTo(150000, 0);
  });

  it('conversion moves money from Traditional to Roth IRA', () => {
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 50000,
      startAge: 65,
      endAge: 65,
    };

    // Run without conversions
    const baseScenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 66,
      baseAnnualSpending: 0, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 300000, rothIRA: 100000, taxable: 0 },
    });

    const withConversion = { ...baseScenario, rothConversion: rc };

    const r1 = runSimulation(baseScenario, { numSimulations: 1, seed: 42 });
    const r2 = runSimulation(withConversion, { numSimulations: 1, seed: 42 });

    const yr1 = r1.medianPath.find(y => y.age === 65)!;
    const yr2 = r2.medianPath.find(y => y.age === 65)!;

    // Traditional should be lower by ~50K (minus any returns)
    expect(yr2.balances.traditional401k).toBeLessThan(yr1.balances.traditional401k);
    // Roth should be higher
    expect(yr2.balances.rothIRA).toBeGreaterThan(yr1.balances.rothIRA);
  });

  it('conversion amount is taxed as ordinary income', () => {
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 50000,
      startAge: 65,
      endAge: 65,
    };

    const baseScenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 66,
      baseAnnualSpending: 0, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 300000, rothIRA: 0, taxable: 0 },
    });

    const withConversion = { ...baseScenario, rothConversion: rc };

    const r1 = runSimulation(baseScenario, { numSimulations: 1, seed: 42 });
    const r2 = runSimulation(withConversion, { numSimulations: 1, seed: 42 });

    // With conversion, federal tax should be higher
    expect(r2.medianPath[0].taxes.federal).toBeGreaterThan(r1.medianPath[0].taxes.federal);
  });

  it('fillBracket computes correct bracket room for MFJ 12%', () => {
    // MFJ 12% bracket top + standard deduction = gross conversion ceiling
    // when other income is zero (see constants/irs-2026.ts).
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fillBracket',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 0,
      startAge: 65,
      endAge: 65,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 66,
      filingStatus: 'mfj',
      jobs: [] as ScenarioInput['jobs'],
      baseAnnualSpending: 0, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      taxBracketInflationRate: 0, // disable indexing for deterministic test
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000, rothIRA: 0, taxable: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath.find(y => y.age === 65)!;
    // MFJ 12% bracket top + std deduction = gross conversion ceiling
    expect(yr.rothConversionAmount).toBeCloseTo(MFJ_12PCT_CEILING, -2);
  });

  it('fillBracket subtracts existing income from bracket room', () => {
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fillBracket',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 0,
      startAge: 67,
      endAge: 67,
    };

    const scenario = makeScenario({
      currentAge: 67, retirementAge: 67, endAge: 68,
      filingStatus: 'mfj',
      baseAnnualSpending: 0, spendingInflationRate: 0,
      socialSecurityBenefit: 2000, // $24K/yr SS
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0,
      pensionAmount: 0,
      taxBracketInflationRate: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000, rothIRA: 0, taxable: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath.find(y => y.age === 67)!;
    // SS = $24K. Provisional income = $12K → below MFJ $32K threshold → 0% SS taxable.
    // Bracket room is not reduced by non-taxable SS, so conversion fills the full bracket.
    expect(yr.rothConversionAmount).toBeCloseTo(MFJ_12PCT_CEILING, -2);
  });

  it('only converts during specified age window', () => {
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 20000,
      startAge: 66,
      endAge: 68,
    };

    const scenario = makeScenario({
      currentAge: 64, retirementAge: 64, endAge: 70,
      baseAnnualSpending: 1000, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    expect(result.medianPath.find(y => y.age === 64)!.rothConversionAmount).toBe(0);
    expect(result.medianPath.find(y => y.age === 65)!.rothConversionAmount).toBe(0);
    expect(result.medianPath.find(y => y.age === 66)!.rothConversionAmount).toBeCloseTo(20000, 0);
    expect(result.medianPath.find(y => y.age === 67)!.rothConversionAmount).toBeCloseTo(20000, 0);
    expect(result.medianPath.find(y => y.age === 68)!.rothConversionAmount).toBeCloseTo(20000, 0);
    expect(result.medianPath.find(y => y.age === 69)!.rothConversionAmount).toBe(0);
    expect(result.medianPath.find(y => y.age === 70)!.rothConversionAmount).toBe(0);
  });

  it('proportionally splits conversion between 401k and IRA', () => {
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 30000,
      startAge: 65,
      endAge: 65,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 66,
      baseAnnualSpending: 0, spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      // 200K in 401k, 100K in IRA → 2:1 ratio
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 200000, traditionalIRA: 100000, rothIRA: 0, taxable: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath.find(y => y.age === 65)!;

    // Original: 401k=200K, IRA=100K. Convert 30K proportionally: 20K from 401k, 10K from IRA
    // After conversion + returns, check the ratio shifted correctly
    expect(yr.rothConversionAmount).toBeCloseTo(30000, 0);
    // 401k should have lost ~20K, IRA ~10K (plus returns which may offset)
    expect(yr.balances.traditional401k).toBeLessThan(210000);
    expect(yr.balances.traditionalIRA).toBeLessThan(105000);
    expect(yr.balances.rothIRA).toBeGreaterThan(30000 - 1); // at least the conversion amount
  });

  it('fillBracket reduces conversion when spending withdrawals need bracket room', () => {
    // Scenario: $5K/mo spending ($60K/yr), no income, only Traditional balance.
    // Spending withdrawals will come from Traditional (~$60K+), so bracket room
    // should be reduced accordingly.
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fillBracket',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 0,
      startAge: 65,
      endAge: 65,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 66,
      filingStatus: 'mfj',
      jobs: [] as ScenarioInput['jobs'],
      baseAnnualSpending: 5000, // $60K/yr
      spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      taxBracketInflationRate: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      // Only Traditional — spending must come from here too
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000, rothIRA: 0, taxable: 0, cashAccount: 0, otherAssets: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath.find(y => y.age === 65)!;
    // Full bracket room minus ~$60K spending withdrawal from Traditional
    expect(yr.rothConversionAmount).toBeCloseTo(MFJ_12PCT_CEILING - 60000, -3);
  });

  it('fillBracket uses full room when non-trad accounts cover spending', () => {
    // Same as above but with $200K in taxable — spending comes from taxable,
    // so full bracket room is available for conversion.
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fillBracket',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 0,
      startAge: 65,
      endAge: 65,
    };

    const scenario = makeScenario({
      currentAge: 65, retirementAge: 65, endAge: 66,
      filingStatus: 'mfj',
      jobs: [] as ScenarioInput['jobs'],
      baseAnnualSpending: 5000, // $60K/yr
      spendingInflationRate: 0,
      socialSecurityBenefit: 0, pensionAmount: 0,
      socialSecurityClaimAge: 90,
      taxBracketInflationRate: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      // Plenty of taxable to cover spending → no traditional withdrawal for spending
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 500000, rothIRA: 0, taxable: 200000, cashAccount: 0, otherAssets: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath.find(y => y.age === 65)!;
    // Taxable covers spending, so full bracket room is available for conversion
    expect(yr.rothConversionAmount).toBeCloseTo(MFJ_12PCT_CEILING, -2);
  });

  it('conversion tax is funded even when income covers spending', () => {
    // SS covers spending entirely, but conversion still generates tax.
    // The income surplus absorbs the conversion tax, so no withdrawal is needed.
    // But the tax IS computed and recorded.
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 50000,
      startAge: 67,
      endAge: 67,
    };

    const scenario = makeScenario({
      currentAge: 67, retirementAge: 67, endAge: 68,
      filingStatus: 'mfj',
      baseAnnualSpending: 2000, // $24K/yr — fully covered by SS
      spendingInflationRate: 0,
      socialSecurityBenefit: 3000, // $36K/yr SS → income > spending
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0,
      pensionAmount: 0,
      taxBracketInflationRate: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 300000, rothIRA: 0, taxable: 0 },
    });

    const noConversion = { ...scenario, rothConversion: { ...rc, enabled: false } };
    const r1 = runSimulation(noConversion, { numSimulations: 1, seed: 42 });
    const r2 = runSimulation(scenario, { numSimulations: 1, seed: 42 });

    // With conversion, tax should be higher (conversion is taxed)
    expect(r2.medianPath[0].taxes.federal).toBeGreaterThan(r1.medianPath[0].taxes.federal);
    // Roth balance should be higher (received the converted amount)
    expect(r2.medianPath[0].balances.rothIRA).toBeGreaterThan(r1.medianPath[0].balances.rothIRA);
  });

  it('conversion tax triggers withdrawals when income barely covers spending', () => {
    // Spending = income, so conversion tax must be funded by withdrawals
    const rc: RothConversion = {
      enabled: true,
      strategy: 'fixedAmount',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 50000,
      startAge: 67,
      endAge: 67,
    };

    const scenario = makeScenario({
      currentAge: 67, retirementAge: 67, endAge: 68,
      filingStatus: 'mfj',
      baseAnnualSpending: 3000, // $36K/yr — exactly equals SS
      spendingInflationRate: 0,
      socialSecurityBenefit: 3000, // $36K/yr SS
      socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0,
      pensionAmount: 0,
      taxBracketInflationRate: 0,
      guardrails: DISABLED_GUARDRAILS,
      healthcare: DISABLED_HEALTHCARE,
      rothConversion: rc,
      balances: { ...DEFAULT_SCENARIO.balances, traditional401k: 300000, rothIRA: 0, taxable: 0 },
    });

    const result = runSimulation(scenario, { numSimulations: 1, seed: 42 });
    const yr = result.medianPath[0];
    // Conversion tax must be funded by withdrawals since income = spending
    const totalW = Object.values(yr.withdrawals).reduce((a, b) => a + b, 0);
    expect(totalW).toBeGreaterThan(0);
    expect(yr.taxes.federal).toBeGreaterThan(0);
  });
});
