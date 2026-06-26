// Tax constants — re-exported from the central IRS tax-year file.
// To update for a new tax year, edit src/constants/irs-2026.ts.

export {
  // Federal brackets
  FEDERAL_BRACKETS_HOH,
  FEDERAL_BRACKETS_MFJ,
  FEDERAL_BRACKETS_SINGLE,
  // Standard deductions
  STANDARD_DEDUCTION_HOH,
  STANDARD_DEDUCTION_MFJ,
  STANDARD_DEDUCTION_SINGLE,
  // LTCG
  LTCG_BRACKETS_HOH,
  LTCG_BRACKETS_MFJ,
  LTCG_BRACKETS_SINGLE,
  // NIIT
  NIIT_RATE,
  NIIT_THRESHOLD_HOH,
  NIIT_THRESHOLD_MFJ,
  NIIT_THRESHOLD_SINGLE,
  // SS taxation
  SS_TAX_THRESHOLD_LOW,
  SS_TAX_THRESHOLD_HIGH,
  SS_TAX_THRESHOLD_LOW_MFJ,
  SS_TAX_THRESHOLD_HIGH_MFJ,
  // FICA
  FICA_SS_RATE,
  FICA_SS_WAGE_BASE,
  FICA_MEDICARE_RATE,
  FICA_MEDICARE_SURTAX_RATE,
  FICA_MEDICARE_SURTAX_THRESHOLD_HOH,
  FICA_MEDICARE_SURTAX_THRESHOLD_MFJ,
  FICA_MEDICARE_SURTAX_THRESHOLD_SINGLE,
  // Lookup helpers
  getFederalBrackets,
  getStandardDeduction,
  getLTCGBrackets,
  getNIITThreshold,
  getSSThresholds,
  getMedicareSurtaxThreshold,
} from './irs-2026';

// Legacy aliases (single/HOH thresholds) kept for backward compatibility.
import { NIIT_THRESHOLD_SINGLE, FICA_MEDICARE_SURTAX_THRESHOLD_SINGLE } from './irs-2026';
export const NIIT_THRESHOLD = NIIT_THRESHOLD_SINGLE;
export const FICA_MEDICARE_SURTAX_THRESHOLD = FICA_MEDICARE_SURTAX_THRESHOLD_SINGLE;
