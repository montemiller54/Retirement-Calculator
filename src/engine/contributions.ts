import type { AccountType, ContributionAllocation, AccountBalances } from '../types';
import { CATCHUP_AGE, DEFAULT_HSA_SELF_ONLY, DEFAULT_401K_CATCHUP, DEFAULT_IRA_CATCHUP } from '../constants/contribution-limits';

export interface ContributionInput {
  totalSavings: number;           // total $ employee contributes this year
  allocation: ContributionAllocation;
  age: number;
  limit401k: number;
  limitIRA: number;
  enable401kCatchUp: boolean;
  enableIRACatchUp: boolean;

  // Employer match
  employerMatch: number;          // total employer match $ for this year (pre-computed by caller)
  employerRothPct: number;        // 0-100: % of employer match → Roth 401k, rest → Trad 401k

  // Inflation-adjusted limits (optional; defaults to current-year constants)
  catchUp401k?: number;
  catchUpIRA?: number;
  hsaLimit?: number;
}

export interface ContributionResult {
  contributions: AccountBalances;
  spilloverToTaxable: number;
  employerContributions: AccountBalances; // employer match (separate from employee)
}

/** Allocate savings across accounts respecting IRS limits; excess spills to taxable */
export function allocateContributions(input: ContributionInput): ContributionResult {
  const {
    totalSavings, allocation, age,
    limit401k, limitIRA,
    enable401kCatchUp, enableIRACatchUp,
    employerMatch = 0, employerRothPct = 0,
    catchUp401k = DEFAULT_401K_CATCHUP,
    catchUpIRA = DEFAULT_IRA_CATCHUP,
    hsaLimit = DEFAULT_HSA_SELF_ONLY,
  } = input;

  // Effective limits
  const catchUpEligible = age >= CATCHUP_AGE;
  const eff401k = limit401k + (catchUpEligible && enable401kCatchUp ? catchUp401k : 0);
  const effIRA = limitIRA + (catchUpEligible && enableIRACatchUp ? catchUpIRA : 0);
  const effHSA = hsaLimit;

  // ── Employee contributions ──
  const desired: AccountBalances = {
    traditional401k: totalSavings * (allocation.traditional401k / 100),
    roth401k:        totalSavings * (allocation.roth401k / 100),
    traditionalIRA:  totalSavings * (allocation.traditionalIRA / 100),
    rothIRA:         totalSavings * (allocation.rothIRA / 100),
    taxable:         totalSavings * (allocation.taxable / 100),
    hsa:             totalSavings * (allocation.hsa / 100),
    cashAccount:     totalSavings * (allocation.cashAccount / 100),
    otherAssets:     totalSavings * (allocation.otherAssets / 100),
  };

  const contributions: AccountBalances = { ...desired };
  let spillover = 0;

  // 401k combined employee limit (traditional + roth share the same cap)
  const combined401k = desired.traditional401k + desired.roth401k;
  if (combined401k > eff401k) {
    const excess = combined401k - eff401k;
    const ratio = eff401k / combined401k;
    contributions.traditional401k = desired.traditional401k * ratio;
    contributions.roth401k = desired.roth401k * ratio;
    spillover += excess;
  }

  // IRA combined limit
  const combinedIRA = desired.traditionalIRA + desired.rothIRA;
  if (combinedIRA > effIRA) {
    const excess = combinedIRA - effIRA;
    const ratio = effIRA / combinedIRA;
    contributions.traditionalIRA = desired.traditionalIRA * ratio;
    contributions.rothIRA = desired.rothIRA * ratio;
    spillover += excess;
  }

  // HSA limit
  if (desired.hsa > effHSA) {
    spillover += desired.hsa - effHSA;
    contributions.hsa = effHSA;
  }

  // Add spillover to taxable
  contributions.taxable += spillover;

  // ── Employer match (does NOT count toward employee deferral limit) ──
  const employerContributions: AccountBalances = {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };
  if (employerMatch > 0) {
    const rothShare = employerMatch * (employerRothPct / 100);
    const tradShare = employerMatch - rothShare;
    employerContributions.roth401k = rothShare;
    employerContributions.traditional401k = tradShare;
  }

  return {
    contributions,
    spilloverToTaxable: spillover,
    employerContributions,
  };
}
