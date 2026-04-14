import { UNIFORM_LIFETIME_TABLE, RMD_START_AGE } from '../constants/rmd-table';

/** Calculate Required Minimum Distribution for a given age and prior year-end balance */
export function calculateRMD(age: number, priorYearEndBalance: number): number {
  if (age < RMD_START_AGE || priorYearEndBalance <= 0) return 0;
  const divisor = UNIFORM_LIFETIME_TABLE[age] ?? UNIFORM_LIFETIME_TABLE[120];
  return priorYearEndBalance / divisor;
}
