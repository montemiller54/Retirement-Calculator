/**
 * ─────────────────────────────────────────────────────────────────────────
 *  IRS / SSA tax-year constants
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Single source of truth for everything that the IRS or SSA re-publishes
 *  each year. When you need to update for a new tax year, edit this file
 *  (and only this file) — every other module re-exports from here.
 *
 *  Reference sources (update links each year):
 *    – IRS Rev. Proc. inflation adjustments
 *        https://www.irs.gov/newsroom (search "inflation adjustments")
 *    – IRS 401(k)/IRA contribution limits
 *        https://www.irs.gov/newsroom/401k-limit-increases
 *    – SSA cost-of-living + wage base + bend points
 *        https://www.ssa.gov/oact/cola/Benefits.html
 *        https://www.ssa.gov/oact/cola/cbb.html
 *
 *  Last verified for tax year: 2026
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { FilingStatus } from '../types';

export const TAX_YEAR = 2026;

// ── Federal income tax brackets ──────────────────────────────────────────

type Bracket = { min: number; max: number; rate: number };

export const FEDERAL_BRACKETS_SINGLE: Bracket[] = [
  { min: 0,       max: 11925,  rate: 0.10 },
  { min: 11925,   max: 48475,  rate: 0.12 },
  { min: 48475,   max: 103350, rate: 0.22 },
  { min: 103350,  max: 197300, rate: 0.24 },
  { min: 197300,  max: 250525, rate: 0.32 },
  { min: 250525,  max: 626350, rate: 0.35 },
  { min: 626350,  max: Infinity, rate: 0.37 },
];

export const FEDERAL_BRACKETS_MFJ: Bracket[] = [
  { min: 0,       max: 23850,  rate: 0.10 },
  { min: 23850,   max: 96950,  rate: 0.12 },
  { min: 96950,   max: 206700, rate: 0.22 },
  { min: 206700,  max: 394600, rate: 0.24 },
  { min: 394600,  max: 501050, rate: 0.32 },
  { min: 501050,  max: 751600, rate: 0.35 },
  { min: 751600,  max: Infinity, rate: 0.37 },
];

export const FEDERAL_BRACKETS_HOH: Bracket[] = [
  { min: 0,       max: 17000,  rate: 0.10 },
  { min: 17000,   max: 64850,  rate: 0.12 },
  { min: 64850,   max: 103350, rate: 0.22 },
  { min: 103350,  max: 197300, rate: 0.24 },
  { min: 197300,  max: 250500, rate: 0.32 },
  { min: 250500,  max: 626350, rate: 0.35 },
  { min: 626350,  max: Infinity, rate: 0.37 },
];

// ── Standard deductions (post-OBBBA values for 2026) ─────────────────────

export const STANDARD_DEDUCTION_SINGLE = 16100;
export const STANDARD_DEDUCTION_MFJ    = 32200;
export const STANDARD_DEDUCTION_HOH    = 24150;

// ── Long-term capital gains brackets ─────────────────────────────────────

export const LTCG_BRACKETS_SINGLE: Bracket[] = [
  { min: 0,       max: 48350,  rate: 0.00 },
  { min: 48350,   max: 533400, rate: 0.15 },
  { min: 533400,  max: Infinity, rate: 0.20 },
];

export const LTCG_BRACKETS_MFJ: Bracket[] = [
  { min: 0,       max: 96700,  rate: 0.00 },
  { min: 96700,   max: 600050, rate: 0.15 },
  { min: 600050,  max: Infinity, rate: 0.20 },
];

export const LTCG_BRACKETS_HOH: Bracket[] = [
  { min: 0,       max: 64750,  rate: 0.00 },
  { min: 64750,   max: 566700, rate: 0.15 },
  { min: 566700,  max: Infinity, rate: 0.20 },
];

// ── Net Investment Income Tax (NIIT) ─────────────────────────────────────

export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD_SINGLE = 200000;
export const NIIT_THRESHOLD_MFJ    = 250000;
export const NIIT_THRESHOLD_HOH    = 200000;

// ── Social Security taxation thresholds (combined-income thresholds) ─────

export const SS_TAX_THRESHOLD_LOW       = 25000; // Single/HOH
export const SS_TAX_THRESHOLD_HIGH      = 34000;
export const SS_TAX_THRESHOLD_LOW_MFJ   = 32000;
export const SS_TAX_THRESHOLD_HIGH_MFJ  = 44000;

// ── FICA (Social Security + Medicare payroll taxes) ──────────────────────

export const FICA_SS_RATE       = 0.062;
export const FICA_SS_WAGE_BASE  = 184500; // 2026 SSA wage base

export const FICA_MEDICARE_RATE          = 0.0145;
export const FICA_MEDICARE_SURTAX_RATE   = 0.009;
export const FICA_MEDICARE_SURTAX_THRESHOLD_SINGLE = 200000;
export const FICA_MEDICARE_SURTAX_THRESHOLD_MFJ    = 250000;
export const FICA_MEDICARE_SURTAX_THRESHOLD_HOH    = 200000;

// ── Social Security PIA (benefit) formula ────────────────────────────────
// 2026 bend points (SSA, indexed annually to Average Wage Index)

export const SS_BEND_POINT_1 = 1286;  // 90% of first $1,286 of AIME
export const SS_BEND_POINT_2 = 7749;  // 32% of AIME between bend points
                                       // 15% above bend point 2

// ── Retirement account contribution limits ──────────────────────────────

export const CONTRIB_401K_LIMIT          = 24500;
export const CONTRIB_401K_CATCHUP        = 8000;   // age 50+
export const CONTRIB_401K_SUPER_CATCHUP  = 11250;  // SECURE 2.0: ages 60-63

export const CONTRIB_IRA_LIMIT           = 7500;
export const CONTRIB_IRA_CATCHUP         = 1100;   // age 50+

export const CONTRIB_HSA_SELF_ONLY       = 4400;

export const CATCHUP_AGE                 = 50;
export const SUPER_CATCHUP_START_AGE     = 60;
export const SUPER_CATCHUP_END_AGE       = 63;

// ── Required Minimum Distribution (RMD) ──────────────────────────────────
//
// SECURE 2.0 phase-in:
//   - Born 1951–1959 → RMDs begin at age 73
//   - Born 1960 or later → RMDs begin at age 75
//
// `RMD_START_AGE` is the conservative default (73). Callers that know the
// participant's birth year should use `getRmdStartAge(birthYear)`.

export const RMD_START_AGE = 73;

export function getRmdStartAge(birthYear: number): number {
  return birthYear >= 1960 ? 75 : 73;
}

// IRS Uniform Lifetime Table for RMD calculations
// Key = age, Value = distribution period (years)
export const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  72: 27.4,
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
  111: 3.4,
  112: 3.3,
  113: 3.1,
  114: 3.0,
  115: 2.9,
  116: 2.8,
  117: 2.7,
  118: 2.5,
  119: 2.3,
  120: 2.0,
};

// ── Filing-status lookup helpers ─────────────────────────────────────────

export function getFederalBrackets(fs: FilingStatus): Bracket[] {
  if (fs === 'mfj') return FEDERAL_BRACKETS_MFJ;
  if (fs === 'single') return FEDERAL_BRACKETS_SINGLE;
  return FEDERAL_BRACKETS_HOH;
}

export function getStandardDeduction(fs: FilingStatus): number {
  if (fs === 'mfj') return STANDARD_DEDUCTION_MFJ;
  if (fs === 'single') return STANDARD_DEDUCTION_SINGLE;
  return STANDARD_DEDUCTION_HOH;
}

export function getLTCGBrackets(fs: FilingStatus): Bracket[] {
  if (fs === 'mfj') return LTCG_BRACKETS_MFJ;
  if (fs === 'single') return LTCG_BRACKETS_SINGLE;
  return LTCG_BRACKETS_HOH;
}

export function getNIITThreshold(fs: FilingStatus): number {
  if (fs === 'mfj') return NIIT_THRESHOLD_MFJ;
  if (fs === 'single') return NIIT_THRESHOLD_SINGLE;
  return NIIT_THRESHOLD_HOH;
}

export function getSSThresholds(fs: FilingStatus): { low: number; high: number } {
  if (fs === 'mfj') return { low: SS_TAX_THRESHOLD_LOW_MFJ, high: SS_TAX_THRESHOLD_HIGH_MFJ };
  return { low: SS_TAX_THRESHOLD_LOW, high: SS_TAX_THRESHOLD_HIGH };
}

export function getMedicareSurtaxThreshold(fs: FilingStatus): number {
  if (fs === 'mfj') return FICA_MEDICARE_SURTAX_THRESHOLD_MFJ;
  if (fs === 'single') return FICA_MEDICARE_SURTAX_THRESHOLD_SINGLE;
  return FICA_MEDICARE_SURTAX_THRESHOLD_HOH;
}
