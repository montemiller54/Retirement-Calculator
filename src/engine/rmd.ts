import { UNIFORM_LIFETIME_TABLE, RMD_START_AGE } from '../constants/rmd-table';

/** Calculate Required Minimum Distribution for a given age and prior year-end balance.
 *  rmdStartAge: 73 (born ≤1959) or 75 (born ≥1960) per SECURE 2.0 — see getRmdStartAge(). */
export function calculateRMD(age: number, priorYearEndBalance: number, rmdStartAge: number = RMD_START_AGE): number {
  if (age < rmdStartAge || priorYearEndBalance <= 0) return 0;
  const divisor = UNIFORM_LIFETIME_TABLE[age] ?? UNIFORM_LIFETIME_TABLE[120];
  return priorYearEndBalance / divisor;
}
