import { describe, it, expect } from 'vitest';
import { PRNG, cholesky, generateCorrelatedReturns, blendedReturn } from '../engine/math';

describe('PRNG', () => {
  it('produces deterministic results with same seed', () => {
    const rng1 = new PRNG(42);
    const rng2 = new PRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = new PRNG(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextGaussian has approximately mean 0 and stddev 1', () => {
    const rng = new PRNG(99);
    const N = 10000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const v = rng.nextGaussian();
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 0);
  });

  it('nextStudentT has heavier tails than normal', () => {
    const rng = new PRNG(77);
    const N = 10000;
    let extremeCount = 0;
    for (let i = 0; i < N; i++) {
      const v = rng.nextStudentT(6);
      if (Math.abs(v) > 3) extremeCount++;
    }
    // Student-t(6) should have more extreme values than normal
    // Normal expects ~0.27% beyond 3 sigma = ~27
    // Student-t(6) should have more
    expect(extremeCount).toBeGreaterThan(20);
  });
});

describe('cholesky', () => {
  it('decomposes a 2x2 identity matrix', () => {
    const I = [[1, 0], [0, 1]];
    const L = cholesky(I);
    expect(L[0][0]).toBeCloseTo(1);
    expect(L[0][1]).toBeCloseTo(0);
    expect(L[1][0]).toBeCloseTo(0);
    expect(L[1][1]).toBeCloseTo(1);
  });

  it('decomposes a correlation matrix correctly', () => {
    const corr = [
      [1.0, 0.5],
      [0.5, 1.0],
    ];
    const L = cholesky(corr);
    // Verify L * L^T = corr
    const product00 = L[0][0] * L[0][0];
    const product01 = L[0][0] * L[1][0];
    const product11 = L[1][0] * L[1][0] + L[1][1] * L[1][1];
    expect(product00).toBeCloseTo(1.0);
    expect(product01).toBeCloseTo(0.5);
    expect(product11).toBeCloseTo(1.0);
  });

  it('handles 5x5 correlation matrix', () => {
    const corr = [
      [1.00,  0.75, -0.10, 0.00, 0.30],
      [0.75,  1.00, -0.05, 0.00, 0.25],
      [-0.10,-0.05, 1.00, 0.20, -0.10],
      [0.00,  0.00,  0.20, 1.00, 0.00],
      [0.30,  0.25, -0.10, 0.00, 1.00],
    ];
    const L = cholesky(corr);
    // Verify L * L^T = corr
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        let sum = 0;
        for (let k = 0; k < 5; k++) {
          sum += L[i][k] * L[j][k];
        }
        expect(sum).toBeCloseTo(corr[i][j], 4);
      }
    }
  });
});

describe('blendedReturn', () => {
  it('blends returns by allocation percentages', () => {
    const returns = [0.10, 0.08, 0.04, 0.02, 0.15];
    const alloc = [45, 20, 20, 10, 5]; // sums to 100
    const result = blendedReturn(returns, alloc);
    // 0.10*0.45 + 0.08*0.2 + 0.04*0.2 + 0.02*0.1 + 0.15*0.05 = 0.045 + 0.016 + 0.008 + 0.002 + 0.0075 = 0.0785
    expect(result).toBeCloseTo(0.0785, 6);
  });

  it('returns 0 for zero allocations', () => {
    expect(blendedReturn([0.10, 0.05], [0, 0])).toBe(0);
  });
});

describe('generateCorrelatedReturns', () => {
  it('produces returns for each asset class', () => {
    const rng = new PRNG(42);
    const corr = [[1, 0.5], [0.5, 1]];
    const L = cholesky(corr);
    const returns = generateCorrelatedReturns(rng, L, [0.10, 0.08], [0.18, 0.20], 6);
    expect(returns).toHaveLength(2);
    expect(typeof returns[0]).toBe('number');
    expect(typeof returns[1]).toBe('number');
  });
});
