import type { FilingStatus } from '../types';

type Bracket = { min: number; max: number; rate: number };

// ── 2026 Federal Tax Brackets (estimated) ──

export const FEDERAL_BRACKETS_HOH: Bracket[] = [
  { min: 0,       max: 16550,  rate: 0.10 },
  { min: 16550,   max: 63100,  rate: 0.12 },
  { min: 63100,   max: 100500, rate: 0.22 },
  { min: 100500,  max: 191950, rate: 0.24 },
  { min: 191950,  max: 243725, rate: 0.32 },
  { min: 243725,  max: 609350, rate: 0.35 },
  { min: 609350,  max: Infinity, rate: 0.37 },
];

export const FEDERAL_BRACKETS_MFJ: Bracket[] = [
  { min: 0,       max: 23630,  rate: 0.10 },
  { min: 23630,   max: 96950,  rate: 0.12 },
  { min: 96950,   max: 206700, rate: 0.22 },
  { min: 206700,  max: 394600, rate: 0.24 },
  { min: 394600,  max: 501050, rate: 0.32 },
  { min: 501050,  max: 751600, rate: 0.35 },
  { min: 751600,  max: Infinity, rate: 0.37 },
];

export const FEDERAL_BRACKETS_SINGLE: Bracket[] = [
  { min: 0,       max: 11925,  rate: 0.10 },
  { min: 11925,   max: 48475,  rate: 0.12 },
  { min: 48475,   max: 103350, rate: 0.22 },
  { min: 103350,  max: 197300, rate: 0.24 },
  { min: 197300,  max: 250525, rate: 0.32 },
  { min: 250525,  max: 626350, rate: 0.35 },
  { min: 626350,  max: Infinity, rate: 0.37 },
];

// ── Standard Deductions ──
export const STANDARD_DEDUCTION_HOH = 24150;
export const STANDARD_DEDUCTION_MFJ = 30750;
export const STANDARD_DEDUCTION_SINGLE = 15700;

// ── Long-term capital gains brackets ──

export const LTCG_BRACKETS_HOH: Bracket[] = [
  { min: 0,       max: 63000,  rate: 0.00 },
  { min: 63000,   max: 551350, rate: 0.15 },
  { min: 551350,  max: Infinity, rate: 0.20 },
];

export const LTCG_BRACKETS_MFJ: Bracket[] = [
  { min: 0,       max: 96700,  rate: 0.00 },
  { min: 96700,   max: 600050, rate: 0.15 },
  { min: 600050,  max: Infinity, rate: 0.20 },
];

export const LTCG_BRACKETS_SINGLE: Bracket[] = [
  { min: 0,       max: 48350,  rate: 0.00 },
  { min: 48350,   max: 533400, rate: 0.15 },
  { min: 533400,  max: Infinity, rate: 0.20 },
];

// ── NIIT threshold ──
export const NIIT_THRESHOLD_HOH = 200000;
export const NIIT_THRESHOLD_MFJ = 250000;
export const NIIT_THRESHOLD_SINGLE = 200000;
// Keep legacy export for backward compat
export const NIIT_THRESHOLD = 200000;
export const NIIT_RATE = 0.038;

// ── Social Security taxation thresholds ──
// Single/HOH
export const SS_TAX_THRESHOLD_LOW = 25000;
export const SS_TAX_THRESHOLD_HIGH = 34000;
// MFJ
export const SS_TAX_THRESHOLD_LOW_MFJ = 32000;
export const SS_TAX_THRESHOLD_HIGH_MFJ = 44000;

// FICA (employee side) — for accumulation wages
export const FICA_SS_RATE = 0.062;
export const FICA_SS_WAGE_BASE = 176100; // 2026 est
export const FICA_MEDICARE_RATE = 0.0145;
export const FICA_MEDICARE_SURTAX_RATE = 0.009;
export const FICA_MEDICARE_SURTAX_THRESHOLD_HOH = 200000;
export const FICA_MEDICARE_SURTAX_THRESHOLD_MFJ = 250000;
export const FICA_MEDICARE_SURTAX_THRESHOLD_SINGLE = 200000;
// Keep legacy export
export const FICA_MEDICARE_SURTAX_THRESHOLD = 200000;

// ── Filing-status lookup helpers ──

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
