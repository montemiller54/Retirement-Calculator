// ── Social Security benefit estimation ──
// Estimates monthly SS benefit from salary using SSA's PIA formula,
// bend-point thresholds, and early/late claiming adjustments.

// 2025 bend points (published by SSA, indexed to Average Wage Index)
const BEND_POINT_1 = 1_174;   // 90% of first $1,174 of AIME
const BEND_POINT_2 = 7_078;   // 32% of AIME between bend points

// 2025 maximum taxable earnings
const SS_WAGE_CAP = 176_100;

// ── PIA from AIME ──
function computePIA(aime: number): number {
  let pia = 0;
  if (aime <= BEND_POINT_1) {
    pia = 0.90 * aime;
  } else if (aime <= BEND_POINT_2) {
    pia = 0.90 * BEND_POINT_1 + 0.32 * (aime - BEND_POINT_1);
  } else {
    pia = 0.90 * BEND_POINT_1 + 0.32 * (BEND_POINT_2 - BEND_POINT_1) + 0.15 * (aime - BEND_POINT_2);
  }
  return Math.floor(pia * 10) / 10; // SSA truncates to dime
}

// ── Full Retirement Age (FRA) in months ──
export function getFullRetirementAgeMonths(birthYear: number): number {
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear === 1955) return 66 * 12 + 2;
  if (birthYear === 1956) return 66 * 12 + 4;
  if (birthYear === 1957) return 66 * 12 + 6;
  if (birthYear === 1958) return 66 * 12 + 8;
  if (birthYear === 1959) return 66 * 12 + 10;
  return 67 * 12; // 1960+
}

// ── Claiming age adjustment factor ──
// Returns a multiplier relative to PIA (1.0 = FRA, <1.0 = early, >1.0 = delayed)
export function claimingAdjustmentFactor(claimAge: number, birthYear: number): number {
  const fraMonths = getFullRetirementAgeMonths(birthYear);
  const claimMonths = claimAge * 12;
  const diff = claimMonths - fraMonths; // positive = delayed, negative = early

  if (diff === 0) return 1.0;

  if (diff < 0) {
    // Early claiming reduction
    const monthsEarly = -diff;
    // First 36 months: 5/9 of 1% per month
    const firstPortion = Math.min(monthsEarly, 36) * (5 / 9 / 100);
    // Additional months beyond 36: 5/12 of 1% per month
    const secondPortion = Math.max(0, monthsEarly - 36) * (5 / 12 / 100);
    return 1.0 - firstPortion - secondPortion;
  }

  // Delayed retirement credits: 2/3 of 1% per month (8% per year), up to age 70
  const monthsDelayed = Math.min(diff, (70 * 12) - fraMonths);
  return 1.0 + monthsDelayed * (2 / 3 / 100);
}

// ── Estimate monthly SS benefit ──
// Uses current monthly salary as proxy for AIME (assumes 35+ years of work by 62).
// Applies PIA bend-point formula and early/late claiming adjustment.
export function estimateSSBenefit(
  monthlySalary: number,
  claimAge: number,
  currentAge: number,
  currentYear: number = 2026,
): number {
  if (monthlySalary <= 0) return 0;

  // Cap at SS taxable max
  const cappedAnnual = Math.min(monthlySalary * 12, SS_WAGE_CAP);
  const aime = cappedAnnual / 12;

  const pia = computePIA(aime);

  // Derive approximate birth year
  const birthYear = currentYear - currentAge;

  // Apply claiming adjustment
  const factor = claimingAdjustmentFactor(claimAge, birthYear);

  return Math.round(pia * factor);
}
