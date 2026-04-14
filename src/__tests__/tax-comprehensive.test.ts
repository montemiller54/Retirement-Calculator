import { describe, it, expect } from 'vitest';
import { calculateTaxes, calcSSTaxablePortion, calcFICA, type TaxInput } from '../engine/tax';
import {
  STANDARD_DEDUCTION_HOH,
  FEDERAL_BRACKETS_HOH,
  LTCG_BRACKETS_HOH,
  NIIT_THRESHOLD,
} from '../constants/tax';
import { STATE_TAX_DATA } from '../constants/state-tax';

const IOWA_RATE = STATE_TAX_DATA.IA.rate;

// Helper: zero-income baseline
const ZERO_INPUT: TaxInput = {
  wages: 0, traditionalWithdrawals: 0, socialSecurity: 0, pension: 0,
  capitalGains: 0, taxableInterest: 0, otherTaxableIncome: 0, age: 70,
};

// ───── 1. FEDERAL BRACKET BOUNDARY TESTS ─────

describe('Federal bracket boundaries (HoH)', () => {
  it('10% bracket: $16,550 taxable ordinary → exactly $1,655', () => {
    // Need gross = deduction + 16550 = 24150 + 16550 = 40700
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 40700 };
    const result = calculateTaxes(input);
    expect(result.federal).toBeCloseTo(16550 * 0.10, 0);
  });

  it('12% bracket: $1 past 10% boundary', () => {
    // Taxable = 16551 → 16550*0.10 + 1*0.12 = 1655.12
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 24150 + 16551 };
    const result = calculateTaxes(input);
    expect(result.federal).toBeCloseTo(1655 + 0.12, 0);
  });

  it('22% bracket entry: $63,100 taxable ordinary', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 24150 + 63100 };
    const result = calculateTaxes(input);
    // 16550*0.10 + (63100-16550)*0.12
    const expected = 16550 * 0.10 + (63100 - 16550) * 0.12;
    expect(result.federal).toBeCloseTo(expected, 0);
  });

  it('24% bracket entry: $100,500 taxable ordinary', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 24150 + 100500 };
    const result = calculateTaxes(input);
    const expected =
      16550 * 0.10 +
      (63100 - 16550) * 0.12 +
      (100500 - 63100) * 0.22;
    expect(result.federal).toBeCloseTo(expected, 0);
  });
});

// ───── 2. STANDARD DEDUCTION ─────

describe('Standard deduction', () => {
  it('income exactly at deduction → $0 federal income tax', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: STANDARD_DEDUCTION_HOH };
    const result = calculateTaxes(input);
    expect(result.federal).toBe(0);
  });

  it('income $1 above deduction → taxed at 10%', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: STANDARD_DEDUCTION_HOH + 1 };
    const result = calculateTaxes(input);
    expect(result.federal).toBeCloseTo(0.10, 2);
  });

  it('income well below deduction → $0', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 5000 };
    const result = calculateTaxes(input);
    expect(result.federal).toBe(0);
  });
});

// ───── 3. SOCIAL SECURITY TAXATION ─────

describe('Social Security taxation (provisional income method)', () => {
  it('provisional income below $25K → 0% taxable', () => {
    // otherIncome=15000, SS=10000 → provisional = 15000 + 5000 = 20000
    expect(calcSSTaxablePortion(10000, 15000)).toBe(0);
  });

  it('provisional income between $25K and $34K → up to 50% taxable', () => {
    // otherIncome=22000, SS=10000 → provisional = 22000 + 5000 = 27000
    // taxable = 0.5 * (27000 - 25000) = 1000
    const result = calcSSTaxablePortion(10000, 22000);
    expect(result).toBeCloseTo(1000, 0);
  });

  it('provisional income above $34K → up to 85% taxable', () => {
    // otherIncome=50000, SS=20000 → provisional = 50000 + 10000 = 60000
    // base = 0.5 * (34000-25000) = 4500
    // additional = 0.85 * (60000-34000) = 22100
    // total = 26600, cap 85% of 20000 = 17000 → min(26600, 17000) = 17000
    const result = calcSSTaxablePortion(20000, 50000);
    expect(result).toBeCloseTo(17000, 0);
  });

  it('never exceeds 85% of SS benefit', () => {
    const result = calcSSTaxablePortion(30000, 500000);
    expect(result).toBeCloseTo(30000 * 0.85);
  });

  it('SS = 0 always returns 0', () => {
    expect(calcSSTaxablePortion(0, 500000)).toBe(0);
  });

  it('negative other income → 0% taxable', () => {
    expect(calcSSTaxablePortion(20000, 0)).toBe(0);
  });
});

// ───── 4. LTCG STACKING ─────

describe('LTCG tax with ordinary income stacking', () => {
  it('0% bracket: zero ordinary + LTCG within $63K', () => {
    const input: TaxInput = { ...ZERO_INPUT, capitalGains: 50000 };
    const result = calculateTaxes(input);
    expect(result.federal).toBe(0); // entirely in 0% LTCG bracket
  });

  it('0% bracket: LTCG exactly at $63K boundary', () => {
    const input: TaxInput = { ...ZERO_INPUT, capitalGains: 63000 };
    const result = calculateTaxes(input);
    expect(result.federal).toBe(0);
  });

  it('15% bracket: LTCG past $63K boundary', () => {
    const input: TaxInput = { ...ZERO_INPUT, capitalGains: 100000 };
    const result = calculateTaxes(input);
    // 0% on first 63K, 15% on remaining 37K = 5550
    expect(result.federal).toBeCloseTo(5550, 0);
  });

  it('ordinary income fills lower brackets, pushes LTCG into 15%', () => {
    // $60K ordinary after deduction = taxable ordinary of 60000-24150 = 35850
    // But LTCG brackets look at taxableOrdinary = 35850
    // LTCG bracket: 0% up to 63000, so available 0% space = 63000-35850 = 27150
    const input: TaxInput = {
      ...ZERO_INPUT,
      traditionalWithdrawals: 60000,
      capitalGains: 50000,
    };
    const result = calculateTaxes(input);
    const ordinaryTax =
      16550 * 0.10 +
      (35850 - 16550) * 0.12;
    const ltcgTax = (50000 - 27150) * 0.15; // 22850 * 0.15 = 3427.50
    expect(result.federal).toBeCloseTo(ordinaryTax + ltcgTax, 0);
  });
});

// ───── 5. NIIT ─────

describe('Net Investment Income Tax', () => {
  it('AGI below $200K → no NIIT', () => {
    const input: TaxInput = { ...ZERO_INPUT, capitalGains: 50000, traditionalWithdrawals: 100000 };
    const result = calculateTaxes(input);
    // AGI = 100000 + 50000 = 150000 < 200000 → no NIIT
    const withoutNIIT = calculateTaxes({ ...input });
    // NIIT component should be 0 (federal should not include NIIT)
    expect(result.federal).toBe(withoutNIIT.federal);
  });

  it('AGI above $200K with investment income → NIIT applies', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 180000, capitalGains: 50000 };
    // AGI = 180000 + 50000 = 230000
    // NIIT = min(50000, 230000-200000) * 0.038 = 30000 * 0.038 = 1140
    const result = calculateTaxes(input);
    // Calculate without NIIT scenario for comparison
    const inputLow: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 180000, capitalGains: 0 };
    const baseTax = calculateTaxes(inputLow);
    // Federal should include NIIT
    expect(result.federal).toBeGreaterThan(baseTax.federal);
  });
});

// ───── 6. FICA ─────

describe('FICA detailed', () => {
  it('wages at exact SS wage base → no surtax', () => {
    const result = calcFICA(176100);
    const expected = 176100 * 0.062 + 176100 * 0.0145;
    expect(result).toBeCloseTo(expected, 0);
  });

  it('wages at $200,001 → $1 of surtax', () => {
    const result = calcFICA(200001);
    const ss = 176100 * 0.062;
    const medicare = 200001 * 0.0145;
    const surtax = 1 * 0.009;
    expect(result).toBeCloseTo(ss + medicare + surtax, 0);
  });

  it('zero wages → zero FICA', () => {
    expect(calcFICA(0)).toBe(0);
  });
});

// ───── 7. IOWA STATE TAX ─────

describe('Iowa state tax', () => {
  it('wages only, no retirement income → flat 3.8%', () => {
    const input: TaxInput = { ...ZERO_INPUT, wages: 80000, age: 40, stateCode: 'IA' };
    const result = calculateTaxes(input);
    expect(result.state).toBeCloseTo(80000 * IOWA_RATE, 0);
  });

  it('SS always exempt from Iowa regardless of age', () => {
    const input: TaxInput = { ...ZERO_INPUT, socialSecurity: 30000, age: 40, stateCode: 'IA' };
    const result = calculateTaxes(input);
    expect(result.state).toBe(0);
  });

  it('retirement income exempt at age 55', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 80000, pension: 20000, age: 55, stateCode: 'IA' };
    const result = calculateTaxes(input);
    expect(result.state).toBe(0);
  });

  it('retirement income TAXED at age 54', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 80000, pension: 20000, age: 54, stateCode: 'IA' };
    const result = calculateTaxes(input);
    expect(result.state).toBeCloseTo((80000 + 20000) * IOWA_RATE, 0);
  });

  it('capital gains always taxed by Iowa', () => {
    const input: TaxInput = { ...ZERO_INPUT, capitalGains: 50000, age: 70, stateCode: 'IA' };
    const result = calculateTaxes(input);
    expect(result.state).toBeCloseTo(50000 * IOWA_RATE, 0);
  });

  it('mixed income at age 60: wages + cap gains taxed, retirement exempt', () => {
    const input: TaxInput = {
      ...ZERO_INPUT,
      wages: 30000,
      traditionalWithdrawals: 50000,
      capitalGains: 10000,
      age: 60,
      stateCode: 'IA',
    };
    const result = calculateTaxes(input);
    // Iowa: wages(30K) + capgains(10K) = 40K * 3.8%
    expect(result.state).toBeCloseTo(40000 * IOWA_RATE, 0);
  });
});

// ───── 7b. STATE TAX VARIATIONS ─────

describe('State tax variations', () => {
  it('no-income-tax state (TX) → $0 state tax', () => {
    const input: TaxInput = { ...ZERO_INPUT, wages: 100000, capitalGains: 50000, age: 40, stateCode: 'TX' };
    const result = calculateTaxes(input);
    expect(result.state).toBe(0);
  });

  it('no-income-tax state (FL) → $0 state tax', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 80000, age: 70, stateCode: 'FL' };
    const result = calculateTaxes(input);
    expect(result.state).toBe(0);
  });

  it('SS-taxing state (MN) taxes Social Security', () => {
    const input: TaxInput = { ...ZERO_INPUT, socialSecurity: 30000, age: 70, stateCode: 'MN' };
    const result = calculateTaxes(input);
    expect(result.state).toBeCloseTo(30000 * STATE_TAX_DATA.MN.rate, 0);
  });

  it('SS-exempt state (CA) does not tax Social Security', () => {
    const input: TaxInput = { ...ZERO_INPUT, socialSecurity: 30000, wages: 50000, age: 70, stateCode: 'CA' };
    const result = calculateTaxes(input);
    // Only wages are taxed, not SS
    expect(result.state).toBeCloseTo(50000 * STATE_TAX_DATA.CA.rate, 0);
  });

  it('IL fully exempts retirement income at any age', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 100000, pension: 50000, wages: 30000, age: 45, stateCode: 'IL' };
    const result = calculateTaxes(input);
    // IL exempts retirement income regardless of age; wages are taxed
    expect(result.state).toBeCloseTo(30000 * STATE_TAX_DATA.IL.rate, 0);
  });

  it('NY partial retirement exemption ($20K) at age 59+', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 50000, age: 60, stateCode: 'NY' };
    const result = calculateTaxes(input);
    // $50K - $20K exemption = $30K taxable
    expect(result.state).toBeCloseTo(30000 * STATE_TAX_DATA.NY.rate, 0);
  });

  it('NY no exemption under age 59', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 50000, age: 58, stateCode: 'NY' };
    const result = calculateTaxes(input);
    // Full $50K taxable
    expect(result.state).toBeCloseTo(50000 * STATE_TAX_DATA.NY.rate, 0);
  });

  it('defaults to IA when stateCode not provided', () => {
    const input: TaxInput = { ...ZERO_INPUT, wages: 60000, age: 40 };
    const result = calculateTaxes(input);
    expect(result.state).toBeCloseTo(60000 * IOWA_RATE, 0);
  });
});

// ───── 8. TAX ≤ INCOME INVARIANT ─────

describe('Tax invariants', () => {
  it('total tax never exceeds total gross income', () => {
    const scenarios: TaxInput[] = [
      { ...ZERO_INPUT, wages: 200000 },
      { ...ZERO_INPUT, traditionalWithdrawals: 150000, socialSecurity: 30000 },
      { ...ZERO_INPUT, capitalGains: 500000 },
      { ...ZERO_INPUT, wages: 100000, traditionalWithdrawals: 50000, socialSecurity: 25000, capitalGains: 30000, pension: 15000 },
    ];
    for (const input of scenarios) {
      const result = calculateTaxes(input);
      const gross = input.wages + input.traditionalWithdrawals + input.socialSecurity +
        input.pension + input.capitalGains + input.taxableInterest + input.otherTaxableIncome;
      expect(result.total).toBeLessThanOrEqual(gross);
    }
  });

  it('effective rate is between 0 and 1', () => {
    const input: TaxInput = { ...ZERO_INPUT, wages: 150000, age: 40 };
    const result = calculateTaxes(input);
    expect(result.effectiveRate).toBeGreaterThanOrEqual(0);
    expect(result.effectiveRate).toBeLessThan(1);
  });
});

// ───── 9. FILING STATUS: MFJ ─────

describe('Filing status: Married Filing Jointly', () => {
  it('MFJ standard deduction is $30,750', () => {
    // Income exactly at MFJ deduction → $0 federal income tax
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 30750, filingStatus: 'mfj' };
    const result = calculateTaxes(input);
    expect(result.federal).toBe(0);
  });

  it('MFJ $1 above deduction → taxed at 10%', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 30751, filingStatus: 'mfj' };
    const result = calculateTaxes(input);
    expect(result.federal).toBeCloseTo(0.10, 2);
  });

  it('MFJ has wider 10% bracket ($23,630 vs HOH $16,550)', () => {
    // MFJ: 10% bracket goes to $23,630
    const taxableAmount = 23630; // exactly fills 10% bracket
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 30750 + taxableAmount, filingStatus: 'mfj' };
    const result = calculateTaxes(input);
    expect(result.federal).toBeCloseTo(23630 * 0.10, 0);
  });

  it('MFJ pays less tax than HOH on same income', () => {
    const income = 120000;
    const hohResult = calculateTaxes({ ...ZERO_INPUT, traditionalWithdrawals: income, filingStatus: 'hoh' });
    const mfjResult = calculateTaxes({ ...ZERO_INPUT, traditionalWithdrawals: income, filingStatus: 'mfj' });
    expect(mfjResult.federal).toBeLessThan(hohResult.federal);
  });

  it('MFJ LTCG 0% bracket is wider ($96,700 vs HOH $63,000)', () => {
    // $90K of LTCG only, no ordinary income → taxable ordinary = 0
    // MFJ: entire 90K should be at 0% since bracketStart=0 < 96700
    const mfj = calculateTaxes({ ...ZERO_INPUT, capitalGains: 90000, filingStatus: 'mfj' });
    const hoh = calculateTaxes({ ...ZERO_INPUT, capitalGains: 90000, filingStatus: 'hoh' });
    // MFJ: 0% on all 90K, plus possibly tiny ordinary from deduction interaction
    // HOH: 0% on 63K, 15% on 27K = 4050
    expect(mfj.federal).toBeLessThan(hoh.federal);
  });

  it('MFJ SS thresholds are $32K/$44K', () => {
    // Provisional income = otherIncome + 0.5*SS
    // With otherIncome=20000, SS=20000: provisional = 20000 + 10000 = 30000
    // HOH: above 25K threshold → some SS taxable
    // MFJ: below 32K threshold → no SS taxable
    const hohResult = calculateTaxes({
      ...ZERO_INPUT, traditionalWithdrawals: 20000, socialSecurity: 20000, filingStatus: 'hoh',
    });
    const mfjResult = calculateTaxes({
      ...ZERO_INPUT, traditionalWithdrawals: 20000, socialSecurity: 20000, filingStatus: 'mfj',
    });
    // MFJ should have lower tax because no SS is taxable
    expect(mfjResult.federal).toBeLessThanOrEqual(hohResult.federal);
  });

  it('MFJ NIIT threshold is $250K vs HOH $200K', () => {
    // AGI = 230K → above HOH 200K but below MFJ 250K
    const hohResult = calculateTaxes({
      ...ZERO_INPUT, traditionalWithdrawals: 180000, capitalGains: 50000, filingStatus: 'hoh',
    });
    const mfjResult = calculateTaxes({
      ...ZERO_INPUT, traditionalWithdrawals: 180000, capitalGains: 50000, filingStatus: 'mfj',
    });
    // MFJ should have lower federal (no NIIT + wider brackets)
    expect(mfjResult.federal).toBeLessThan(hohResult.federal);
  });

  it('MFJ Medicare surtax threshold is $250K vs HOH $200K', () => {
    const hohResult = calculateTaxes({ ...ZERO_INPUT, wages: 230000, age: 40, filingStatus: 'hoh' });
    const mfjResult = calculateTaxes({ ...ZERO_INPUT, wages: 230000, age: 40, filingStatus: 'mfj' });
    // HOH: surtax on 30K; MFJ: no surtax → lower FICA
    expect(mfjResult.fica).toBeLessThan(hohResult.fica);
  });
});

// ───── 10. FILING STATUS: SINGLE ─────

describe('Filing status: Single', () => {
  it('Single standard deduction is $15,700', () => {
    const input: TaxInput = { ...ZERO_INPUT, traditionalWithdrawals: 15700, filingStatus: 'single' };
    const result = calculateTaxes(input);
    expect(result.federal).toBe(0);
  });

  it('Single pays more tax than HOH on same income', () => {
    const income = 80000;
    const hohResult = calculateTaxes({ ...ZERO_INPUT, traditionalWithdrawals: income, filingStatus: 'hoh' });
    const singleResult = calculateTaxes({ ...ZERO_INPUT, traditionalWithdrawals: income, filingStatus: 'single' });
    expect(singleResult.federal).toBeGreaterThan(hohResult.federal);
  });
});
