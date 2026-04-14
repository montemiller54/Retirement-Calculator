import { describe, it, expect } from 'vitest';
import { calculateRMD } from '../engine/rmd';

describe('calculateRMD', () => {
  it('returns 0 for ages below 73', () => {
    expect(calculateRMD(72, 1000000)).toBe(0);
    expect(calculateRMD(60, 500000)).toBe(0);
  });

  it('calculates RMD at age 73', () => {
    const balance = 1000000;
    const rmd = calculateRMD(73, balance);
    // Divisor at 73 = 26.5
    expect(rmd).toBeCloseTo(balance / 26.5, 2);
  });

  it('calculates RMD at age 80', () => {
    const balance = 500000;
    const rmd = calculateRMD(80, balance);
    // Divisor at 80 = 20.2
    expect(rmd).toBeCloseTo(balance / 20.2, 2);
  });

  it('returns 0 for zero balance', () => {
    expect(calculateRMD(75, 0)).toBe(0);
  });

  it('uses last table entry for very old ages', () => {
    const balance = 100000;
    const rmd = calculateRMD(125, balance);
    // Should use age 120 divisor = 2.0
    expect(rmd).toBeCloseTo(balance / 2.0, 2);
  });
});
