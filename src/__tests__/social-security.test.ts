import { describe, it, expect } from 'vitest';
import {
  estimateSSBenefit,
  getFullRetirementAgeMonths,
  claimingAdjustmentFactor,
} from '../utils/social-security';

describe('getFullRetirementAgeMonths', () => {
  it('returns 66 years for birth year 1954 and earlier', () => {
    expect(getFullRetirementAgeMonths(1950)).toBe(66 * 12);
    expect(getFullRetirementAgeMonths(1954)).toBe(66 * 12);
  });

  it('returns 66+2 months for 1955', () => {
    expect(getFullRetirementAgeMonths(1955)).toBe(66 * 12 + 2);
  });

  it('returns 66+6 months for 1957', () => {
    expect(getFullRetirementAgeMonths(1957)).toBe(66 * 12 + 6);
  });

  it('returns 67 years for 1960 and later', () => {
    expect(getFullRetirementAgeMonths(1960)).toBe(67 * 12);
    expect(getFullRetirementAgeMonths(1991)).toBe(67 * 12);
    expect(getFullRetirementAgeMonths(2000)).toBe(67 * 12);
  });
});

describe('claimingAdjustmentFactor', () => {
  // For FRA=67 (born 1960+):
  it('returns 1.0 at FRA (claim 67, born 1960+)', () => {
    expect(claimingAdjustmentFactor(67, 1960)).toBeCloseTo(1.0, 6);
  });

  it('reduces benefit for early claiming at 62 (born 1960+)', () => {
    const factor = claimingAdjustmentFactor(62, 1960);
    // 60 months early: 36 × 5/9% + 24 × 5/12% = 20% + 10% = 30% reduction
    expect(factor).toBeCloseTo(0.70, 2);
  });

  it('reduces benefit for claiming at 65 (born 1960+)', () => {
    const factor = claimingAdjustmentFactor(65, 1960);
    // 24 months early: 24 × 5/9% = 13.33% reduction
    expect(factor).toBeCloseTo(0.8667, 2);
  });

  it('increases benefit for delayed claiming at 70 (born 1960+)', () => {
    const factor = claimingAdjustmentFactor(70, 1960);
    // 36 months delayed: 36 × 2/3% = 24% increase
    expect(factor).toBeCloseTo(1.24, 2);
  });

  it('caps delayed credits at age 70', () => {
    // Even if you pass 70, credits stop accumulating
    const factor70 = claimingAdjustmentFactor(70, 1960);
    expect(factor70).toBeCloseTo(1.24, 2);
  });

  // For FRA=66 (born 1954):
  it('works for FRA=66 birth year', () => {
    const factor = claimingAdjustmentFactor(66, 1954);
    expect(factor).toBeCloseTo(1.0, 6);
  });

  it('delayed credits from FRA 66 to age 70 = 32%', () => {
    const factor = claimingAdjustmentFactor(70, 1954);
    // 48 months delayed: 48 × 2/3% = 32%
    expect(factor).toBeCloseTo(1.32, 2);
  });
});

describe('estimateSSBenefit', () => {
  it('returns 0 for zero salary', () => {
    expect(estimateSSBenefit(0, 67, 35)).toBe(0);
  });

  it('returns a reasonable estimate for $100K salary at FRA', () => {
    // $100K/yr = $8,333/mo salary → AIME = $8,333
    // PIA = 90% × 1174 + 32% × (7078-1174) + 15% × (8333-7078)
    //     = 1056.60 + 1889.28 + 188.25 = $3,134.13 → truncated to dime, rounded to dollar
    const benefit = estimateSSBenefit(8333, 67, 35, 2026);
    expect(benefit).toBeGreaterThan(3000);
    expect(benefit).toBeLessThan(3200);
  });

  it('returns a lower benefit for early claiming at 62', () => {
    const at67 = estimateSSBenefit(8333, 67, 35, 2026);
    const at62 = estimateSSBenefit(8333, 62, 35, 2026);
    expect(at62).toBeLessThan(at67);
    // ~30% reduction for FRA=67
    expect(at62 / at67).toBeCloseTo(0.70, 1);
  });

  it('returns a higher benefit for delayed claiming at 70', () => {
    const at67 = estimateSSBenefit(8333, 67, 35, 2026);
    const at70 = estimateSSBenefit(8333, 70, 35, 2026);
    expect(at70).toBeGreaterThan(at67);
    // ~24% increase
    expect(at70 / at67).toBeCloseTo(1.24, 1);
  });

  it('caps at SS wage cap for high earners', () => {
    // $250K/yr → capped at $176,100 → AIME = $14,675
    const highEarner = estimateSSBenefit(20833, 67, 35, 2026);
    const veryHighEarner = estimateSSBenefit(30000, 67, 35, 2026);
    // Both should produce the same benefit (both above the cap)
    expect(highEarner).toBe(veryHighEarner);
  });

  it('produces a higher benefit for higher salary', () => {
    const low = estimateSSBenefit(3000, 67, 35, 2026);
    const mid = estimateSSBenefit(8333, 67, 35, 2026);
    const high = estimateSSBenefit(15000, 67, 35, 2026);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it('produces benefit in plausible SSA range', () => {
    // Min earner: ~$1,000/mo salary
    const min = estimateSSBenefit(1000, 67, 35, 2026);
    expect(min).toBeGreaterThan(500);
    expect(min).toBeLessThan(1500);

    // Max earner at 70
    const max = estimateSSBenefit(20000, 70, 35, 2026);
    expect(max).toBeGreaterThan(4000);
    expect(max).toBeLessThan(6000);
  });
});
