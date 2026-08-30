import type { FilingStatus } from '../types';
import {
  NIIT_RATE,
  SS_TAX_THRESHOLD_LOW,
  SS_TAX_THRESHOLD_HIGH,
  FICA_SS_RATE,
  FICA_SS_WAGE_BASE,
  FICA_MEDICARE_RATE,
  FICA_MEDICARE_SURTAX_RATE,
  FICA_MEDICARE_SURTAX_THRESHOLD,
  getFederalBrackets,
  getStandardDeduction,
  getLTCGBrackets,
  getNIITThreshold,
  getSSThresholds,
  getMedicareSurtaxThreshold,
} from '../constants/tax';
import { calculateStateTax } from '../constants/state-tax';

// ── Progressive tax calculation ──
function calcProgressiveTax(
  taxableIncome: number,
  brackets: { min: number; max: number; rate: number }[],
): number {
  let tax = 0;
  for (const b of brackets) {
    if (taxableIncome <= b.min) break;
    const taxable = Math.min(taxableIncome, b.max) - b.min;
    tax += taxable * b.rate;
  }
  return tax;
}

// ── Social Security taxable portion ──
export function calcSSTaxablePortion(
  ssBenefit: number,
  otherIncome: number, // AGI excluding SS
): number {
  return calcSSTaxablePortionIndexed(ssBenefit, otherIncome, SS_TAX_THRESHOLD_LOW, SS_TAX_THRESHOLD_HIGH);
}

function calcSSTaxablePortionIndexed(
  ssBenefit: number,
  otherIncome: number,
  thresholdLow: number,
  thresholdHigh: number,
): number {
  if (ssBenefit <= 0) return 0;
  const provisionalIncome = otherIncome + ssBenefit * 0.5;

  if (provisionalIncome <= thresholdLow) {
    return 0;
  } else if (provisionalIncome <= thresholdHigh) {
    return Math.min(
      0.5 * (provisionalIncome - thresholdLow),
      0.5 * ssBenefit,
    );
  } else {
    const base = Math.min(
      0.5 * (thresholdHigh - thresholdLow),
      0.5 * ssBenefit,
    );
    const additional = 0.85 * (provisionalIncome - thresholdHigh);
    return Math.min(base + additional, 0.85 * ssBenefit);
  }
}

// ── FICA taxes (employee portion on wages) ──
export function calcFICA(wages: number): number {
  const ssTax = Math.min(wages, FICA_SS_WAGE_BASE) * FICA_SS_RATE;
  const medicareTax = wages * FICA_MEDICARE_RATE;
  const surtax = Math.max(0, wages - FICA_MEDICARE_SURTAX_THRESHOLD) * FICA_MEDICARE_SURTAX_RATE;
  return ssTax + medicareTax + surtax;
}

// ── Full annual tax calculation ──
export interface TaxInput {
  wages: number;
  traditionalWithdrawals: number;  // pre-tax 401k/IRA withdrawals including RMDs
  socialSecurity: number;
  pension: number;
  capitalGains: number;     // realized LTCG from taxable account
  taxableInterest: number;  // from cash/bond portion of taxable account
  otherTaxableIncome: number;
  age: number;
  filingStatus?: FilingStatus;            // defaults to 'hoh' for backward compat
  stateCode?: string;                     // defaults to 'IA' for backward compat
  yearsFromNow?: number;             // years elapsed since simulation start
  taxBracketInflationRate?: number;   // annual indexing rate for brackets/thresholds
  earlyWithdrawalPenaltyAmount?: number;  // amount subject to 10% early withdrawal penalty
  ficaWages?: number;   // FICA base (gross wages minus payroll HSA); defaults to wages
}

export interface TaxResult {
  federal: number;
  state: number;
  capitalGains: number;
  fica: number;
  earlyWithdrawalPenalty: number;
  total: number;
  effectiveRate: number;
  marginalRate: number;
}

export function calculateTaxes(input: TaxInput): TaxResult {
  const {
    wages, traditionalWithdrawals, socialSecurity, pension,
    capitalGains, taxableInterest, otherTaxableIncome, age,
    filingStatus = 'hoh',
    stateCode = 'IA',
    yearsFromNow = 0, taxBracketInflationRate = 0,
    earlyWithdrawalPenaltyAmount = 0,
    ficaWages,
  } = input;

  // Inflation factor for indexing brackets/thresholds
  const idx = Math.pow(1 + taxBracketInflationRate, yearsFromNow);

  // Inflate bracket thresholds
  const inflateBrackets = (brackets: { min: number; max: number; rate: number }[]) =>
    brackets.map(b => ({
      min: b.min * idx,
      max: b.max === Infinity ? Infinity : b.max * idx,
      rate: b.rate,
    }));

  // Select tables based on filing status
  const fedBrackets = inflateBrackets(getFederalBrackets(filingStatus));
  const ltcgBrackets = inflateBrackets(getLTCGBrackets(filingStatus));
  const stdDeduction = getStandardDeduction(filingStatus) * idx;
  // Statutorily frozen thresholds — NOT indexed: SS taxation (since 1983/1993),
  // NIIT and Additional Medicare Tax (since 2013)
  const niitThreshold = getNIITThreshold(filingStatus);
  const ssThresholds = getSSThresholds(filingStatus);
  const ssThresholdLow = ssThresholds.low;
  const ssThresholdHigh = ssThresholds.high;
  const medicareSurtaxThreshold = getMedicareSurtaxThreshold(filingStatus);
  // SSA indexes the wage base annually
  const ficaWageBase = FICA_SS_WAGE_BASE * idx;

  // ── Federal ──
  // Ordinary income (before SS)
  const ordinaryIncomeExSS = wages + traditionalWithdrawals + pension +
    taxableInterest + otherTaxableIncome;

  // SS taxable portion (using indexed thresholds)
  // Provisional income is AGI excluding SS (Pub 915), which includes capital gains
  const ssTaxable = calcSSTaxablePortionIndexed(socialSecurity, ordinaryIncomeExSS + capitalGains, ssThresholdLow, ssThresholdHigh);

  // Total ordinary income
  const totalOrdinaryIncome = ordinaryIncomeExSS + ssTaxable;

  // Taxable ordinary income after standard deduction
  const taxableOrdinary = Math.max(0, totalOrdinaryIncome - stdDeduction);

  // Federal income tax on ordinary income
  const federalOrdinaryTax = calcProgressiveTax(taxableOrdinary, fedBrackets);

  // Long-term capital gains tax
  // LTCG brackets stack on top of ordinary income
  let ltcgTax = 0;
  if (capitalGains > 0) {
    let remaining = capitalGains;
    for (const b of ltcgBrackets) {
      if (remaining <= 0) break;
      const bracketStart = Math.max(b.min, taxableOrdinary);
      if (bracketStart >= b.max) continue;
      const space = b.max - bracketStart;
      const inBracket = Math.min(remaining, space);
      ltcgTax += inBracket * b.rate;
      remaining -= inBracket;
    }
  }

  // NIIT (3.8% on investment income above threshold)
  const agi = totalOrdinaryIncome + capitalGains;
  const netInvestmentIncome = capitalGains + taxableInterest;
  const niit = Math.max(0, Math.min(netInvestmentIncome, agi - niitThreshold)) * NIIT_RATE;

  const totalFederal = federalOrdinaryTax + ltcgTax + Math.max(0, niit);

  // ── FICA (indexed wage base and surtax threshold) ──
  // 401k deferrals remain FICA-taxable, so the base can exceed income-tax wages
  const ficaBase = ficaWages ?? wages;
  let fica = 0;
  if (ficaBase > 0) {
    const ssTax = Math.min(ficaBase, ficaWageBase) * FICA_SS_RATE;
    const medicareTax = ficaBase * FICA_MEDICARE_RATE;
    const surtax = Math.max(0, ficaBase - medicareSurtaxThreshold) * FICA_MEDICARE_SURTAX_RATE;
    fica = ssTax + medicareTax + surtax;
  }

  // ── State ──
  const stateTax = calculateStateTax({
    stateCode,
    wages,
    socialSecurity,
    pension,
    traditionalWithdrawals,
    capitalGains,
    taxableInterest,
    otherTaxableIncome,
    age,
  });

  // ── Early withdrawal penalty (10% on amounts withdrawn before 59½) ──
  const earlyWithdrawalPenalty = earlyWithdrawalPenaltyAmount > 0 ? earlyWithdrawalPenaltyAmount * 0.10 : 0;

  // ── Totals ──
  const total = totalFederal + stateTax + fica + earlyWithdrawalPenalty;
  const grossIncome = wages + traditionalWithdrawals + socialSecurity +
    pension + capitalGains + taxableInterest + otherTaxableIncome;

  // Marginal rate: find the bracket for taxableOrdinary
  let marginalRate = 0;
  for (const b of fedBrackets) {
    if (taxableOrdinary > b.min) marginalRate = b.rate;
  }

  return {
    federal: totalFederal,
    state: stateTax,
    capitalGains: ltcgTax,
    fica,
    earlyWithdrawalPenalty,
    total,
    effectiveRate: grossIncome > 0 ? total / grossIncome : 0,
    marginalRate,
  };
}
