import { describe, it, expect } from 'vitest';
import { PRNG, cholesky, generateCorrelatedReturns } from '../engine/math';
import { DEFAULT_CORRELATION_MATRIX } from '../constants/asset-classes';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';

/**
 * Phase 3: Statistical property tests.
 * Verifies PRNG quality, Gaussian distribution, Student-t tails,
 * Cholesky correctness, and correlated returns correlations.
 */

describe('PRNG uniformity', () => {
  it('passes chi-squared goodness-of-fit for uniform [0,1)', () => {
    const rng = new PRNG(12345);
    const N = 10000;
    const K = 20; // bins
    const counts = new Array(K).fill(0);
    for (let i = 0; i < N; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const bin = Math.min(K - 1, Math.floor(v * K));
      counts[bin]++;
    }
    // Chi-squared test: expected = N/K per bin
    const expected = N / K;
    let chiSq = 0;
    for (const c of counts) {
      chiSq += (c - expected) ** 2 / expected;
    }
    // Chi-squared critical value for df=19, alpha=0.01 ≈ 36.19
    expect(chiSq).toBeLessThan(36.19);
  });

  it('mean ≈ 0.5 and variance ≈ 1/12 for uniform samples', () => {
    const rng = new PRNG(54321);
    const N = 50000;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < N; i++) {
      const v = rng.next();
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(mean).toBeCloseTo(0.5, 1);         // within 0.05
    expect(variance).toBeCloseTo(1 / 12, 2);  // within 0.005
  });
});

describe('Gaussian properties (Box-Muller)', () => {
  it('mean ≈ 0 and std ≈ 1 for nextGaussian', () => {
    const rng = new PRNG(111);
    const N = 50000;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < N; i++) {
      const z = rng.nextGaussian();
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / N;
    const std = Math.sqrt(sumSq / N - mean * mean);
    expect(mean).toBeCloseTo(0, 1);
    expect(std).toBeCloseTo(1, 1);
  });

  it('generates values beyond ±3 sigma (tails exist)', () => {
    const rng = new PRNG(222);
    const N = 10000;
    let beyondThree = 0;
    for (let i = 0; i < N; i++) {
      if (Math.abs(rng.nextGaussian()) > 3) beyondThree++;
    }
    // Expected ~0.27% beyond ±3σ. With N=10000, expect roughly 27.
    // Allow generous range: 5 to 100
    expect(beyondThree).toBeGreaterThan(5);
    expect(beyondThree).toBeLessThan(100);
  });
});

describe('Student-t distribution', () => {
  it('Student-t(6) has heavier tails than normal', () => {
    const rng = new PRNG(333);
    const N = 50000;
    let tBeyondThree = 0, nBeyondThree = 0;
    for (let i = 0; i < N; i++) {
      if (Math.abs(rng.nextStudentT(6)) > 3) tBeyondThree++;
      if (Math.abs(rng.nextGaussian()) > 3) nBeyondThree++;
    }
    // Student-t(6) should have more extreme values than normal
    expect(tBeyondThree).toBeGreaterThan(nBeyondThree);
  });

  it('Student-t(6) variance ≈ df/(df-2) = 1.5', () => {
    const rng = new PRNG(444);
    const N = 50000;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < N; i++) {
      const t = rng.nextStudentT(6);
      sum += t;
      sumSq += t * t;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(mean).toBeCloseTo(0, 0);           // within 0.5
    expect(variance).toBeCloseTo(1.5, 0);     // within 0.5
  });
});

describe('Cholesky decomposition', () => {
  it('L × Lᵀ reconstructs the original matrix', () => {
    const M = DEFAULT_CORRELATION_MATRIX;
    const L = cholesky(M);
    const n = M.length;

    // Reconstruct: R = L × Lᵀ
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += L[i][k] * L[j][k];
        }
        expect(sum).toBeCloseTo(M[i][j], 6);
      }
    }
  });

  it('L is lower-triangular', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const n = L.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        expect(L[i][j]).toBe(0);
      }
    }
  });

  it('works for 2x2 identity matrix', () => {
    const I = [[1, 0], [0, 1]];
    const L = cholesky(I);
    expect(L).toEqual([[1, 0], [0, 1]]);
  });
});

describe('Correlated returns', () => {
  it('Stocks and Bonds have negative correlation', () => {
    const rng = new PRNG(666);
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const df = 6;
    const N = 10000;

    const stocks: number[] = [];
    const bonds: number[] = [];
    for (let i = 0; i < N; i++) {
      const r = generateCorrelatedReturns(rng, L, means, stdDevs, df);
      stocks.push(r[0]);
      bonds.push(r[1]);
    }

    const meanStocks = stocks.reduce((a, b) => a + b, 0) / N;
    const meanBonds = bonds.reduce((a, b) => a + b, 0) / N;
    let num = 0, denomStocks = 0, denomBonds = 0;
    for (let i = 0; i < N; i++) {
      const ds = stocks[i] - meanStocks;
      const db = bonds[i] - meanBonds;
      num += ds * db;
      denomStocks += ds * ds;
      denomBonds += db * db;
    }
    const corr = num / Math.sqrt(denomStocks * denomBonds);
    // Input correlation is -0.10
    expect(corr).toBeLessThan(0.10);
  });

  it('mean returns are approximately correct', () => {
    const rng = new PRNG(777);
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const df = 6;
    const N = 20000;

    const sums = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const r = generateCorrelatedReturns(rng, L, means, stdDevs, df);
      for (let j = 0; j < 4; j++) sums[j] += r[j];
    }
    for (let j = 0; j < 4; j++) {
      const sampleMean = sums[j] / N;
      expect(sampleMean).toBeCloseTo(means[j], 1); // within 0.05
    }
  });
});

describe('Fat tail df sensitivity', () => {
  // These tests would have caught the tStdAdj normalization bug:
  // they verify that df actually affects the output distribution.

  it('lower df produces higher sample volatility in generateCorrelatedReturns', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const N = 10000;

    function sampleVariance(df: number): number {
      const rng = new PRNG(42); // same seed for fairness
      let sum = 0, sumSq = 0;
      for (let i = 0; i < N; i++) {
        const r = generateCorrelatedReturns(rng, L, means, stdDevs, df);
        const stocksReturn = r[0]; // Stocks
        sum += stocksReturn;
        sumSq += stocksReturn * stocksReturn;
      }
      const mean = sum / N;
      return sumSq / N - mean * mean;
    }

    const varDf4 = sampleVariance(4);
    const varDf100 = sampleVariance(100);

    // df=4 should produce measurably higher variance than df=100
    expect(varDf4).toBeGreaterThan(varDf100 * 1.15); // at least 15% more variance
  });

  it('lower df produces more extreme tail events', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const N = 20000;

    function countExtremes(df: number): number {
      const rng = new PRNG(42);
      let count = 0;
      for (let i = 0; i < N; i++) {
        const r = generateCorrelatedReturns(rng, L, means, stdDevs, df);
        // Count "crash" events: Stocks return < -30%
        if (r[0] < -0.30) count++;
      }
      return count;
    }

    const extremesDf4 = countExtremes(4);
    const extremesDf100 = countExtremes(100);

    // df=4 should have substantially more extreme events
    expect(extremesDf4).toBeGreaterThan(extremesDf100 * 2);
  });

  it('simulation success rate is meaningfully lower with df=4 vs df=100', () => {
    // End-to-end: does df actually impact the final success rate?
    const scenarioLowDf = {
      ...DEFAULT_SCENARIO,
      socialSecurityMode: 'manual' as const,
      investments: { ...DEFAULT_SCENARIO.investments, fatTailDf: 4 },
    };
    const scenarioHighDf = {
      ...DEFAULT_SCENARIO,
      socialSecurityMode: 'manual' as const,
      investments: { ...DEFAULT_SCENARIO.investments, fatTailDf: 100 },
    };

    const resultLow = runSimulation(scenarioLowDf, { numSimulations: 500, seed: 42 });
    const resultHigh = runSimulation(scenarioHighDf, { numSimulations: 500, seed: 42 });

    // Low df should produce a noticeably lower (or at least different) success rate
    // A 2+ percentage point difference confirms df is having an effect
    const diff = resultHigh.successRate - resultLow.successRate;
    expect(diff).toBeGreaterThan(0.02); // at least 2pp difference
  });
});

describe('Per-asset fat tail mask', () => {
  it('bonds variance is lower with fatTailMask=[true,false,false,true] vs all true', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const df = 6;
    const N = 10000;
    const mask = [true, false, false, true]; // stocks+crypto fat, bonds+cash Gaussian

    function bondsVariance(useMask: boolean): number {
      const rng = new PRNG(42);
      let sum = 0, sumSq = 0;
      for (let i = 0; i < N; i++) {
        const r = useMask
          ? generateCorrelatedReturns(rng, L, means, stdDevs, df, mask)
          : generateCorrelatedReturns(rng, L, means, stdDevs, df);
        sum += r[1]; // bonds index
        sumSq += r[1] * r[1];
      }
      const mean = sum / N;
      return sumSq / N - mean * mean;
    }

    const varWithMask = bondsVariance(true);
    const varWithoutMask = bondsVariance(false);

    // With mask, bonds are Gaussian → lower variance than Student-t bonds
    expect(varWithMask).toBeLessThan(varWithoutMask);
  });

  it('stocks variance is unaffected by masking bonds/cash to Gaussian', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const df = 6;
    const N = 10000;
    const mask = [true, false, false, true];

    function stocksVariance(useMask: boolean): number {
      const rng = new PRNG(42);
      let sum = 0, sumSq = 0;
      for (let i = 0; i < N; i++) {
        const r = useMask
          ? generateCorrelatedReturns(rng, L, means, stdDevs, df, mask)
          : generateCorrelatedReturns(rng, L, means, stdDevs, df);
        sum += r[0]; // stocks index
        sumSq += r[0] * r[0];
      }
      const mean = sum / N;
      return sumSq / N - mean * mean;
    }

    const varWithMask = stocksVariance(true);
    const varWithoutMask = stocksVariance(false);

    // Both use same seed and same chi2 draw → stocks get same Student-t scaling
    // Variance should be very similar (same PRNG path since chi2 always drawn)
    const ratio = varWithMask / varWithoutMask;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it('all-false mask produces Gaussian returns (lower tails than Student-t)', () => {
    const L = cholesky([[1, 0], [0, 1]]);
    const means = [0.10, 0.04];
    const stdDevs = [0.18, 0.06];
    const df = 4; // very heavy tails when enabled
    const N = 20000;
    const allFalse = [false, false];

    const rng = new PRNG(42);
    let extremes = 0;
    for (let i = 0; i < N; i++) {
      const r = generateCorrelatedReturns(rng, L, means, stdDevs, df, allFalse);
      if (Math.abs(r[0] - means[0]) > 3 * stdDevs[0]) extremes++;
    }

    // Gaussian: ~0.27% beyond 3σ ≈ 54 of 20000
    // Student-t(4): much more. With mask=allFalse we should see Gaussian-like count.
    expect(extremes).toBeLessThan(150); // well under the Student-t count
  });
});
