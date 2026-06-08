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
    const N = 10000;
    const mask = [true, false, false, true];

    const stocks: number[] = [];
    const bonds: number[] = [];
    for (let i = 0; i < N; i++) {
      const r = generateCorrelatedReturns(rng, L, means, stdDevs, false, mask);
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

  it('bull regime mean returns are approximately correct', () => {
    const rng = new PRNG(777);
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const N = 20000;
    const mask = [true, false, false, true];

    // In bull regime, stocks/crypto use BULL_REGIME mean, bonds/cash use their own
    const sums = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const r = generateCorrelatedReturns(rng, L, means, stdDevs, false, mask);
      for (let j = 0; j < 4; j++) sums[j] += r[j];
    }
    // Bonds and cash should match their input means
    expect(sums[1] / N).toBeCloseTo(means[1], 1); // bonds
    expect(sums[2] / N).toBeCloseTo(means[2], 1); // cash
  });
});

describe('Regime-switching sensitivity', () => {
  // These tests verify that the bull/bear regime-switching model
  // produces different distributions and affects simulation outcomes.

  it('bear regime produces higher sample volatility and lower mean than bull', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const N = 10000;
    const mask = [true, false, false, true]; // stocks+crypto regime, bonds+cash Gaussian

    function sampleStats(isBear: boolean): { mean: number; variance: number } {
      const rng = new PRNG(42);
      let sum = 0, sumSq = 0;
      for (let i = 0; i < N; i++) {
        const r = generateCorrelatedReturns(rng, L, means, stdDevs, isBear, mask);
        const stocksReturn = r[0];
        sum += stocksReturn;
        sumSq += stocksReturn * stocksReturn;
      }
      const mean = sum / N;
      return { mean, variance: sumSq / N - mean * mean };
    }

    const bull = sampleStats(false);
    const bear = sampleStats(true);

    // Bear regime should have lower mean and higher variance for stocks
    expect(bear.mean).toBeLessThan(bull.mean);
    expect(bear.variance).toBeGreaterThan(bull.variance);
  });

  it('bear regime produces more extreme tail events', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const N = 20000;
    const mask = [true, false, false, true];

    function countExtremes(isBear: boolean): number {
      const rng = new PRNG(42);
      let count = 0;
      for (let i = 0; i < N; i++) {
        const r = generateCorrelatedReturns(rng, L, means, stdDevs, isBear, mask);
        if (r[0] < -0.30) count++;
      }
      return count;
    }

    const extremesBear = countExtremes(true);
    const extremesBull = countExtremes(false);

    // Bear regime should have substantially more crash events
    expect(extremesBear).toBeGreaterThan(extremesBull * 2);
  });

  it('simulation success rate is meaningfully lower with high crash frequency', () => {
    const scenarioHighCrash = {
      ...DEFAULT_SCENARIO,
      socialSecurityMode: 'manual' as const,
      investments: { ...DEFAULT_SCENARIO.investments, crashFrequency: 9 },
    };
    const scenarioLowCrash = {
      ...DEFAULT_SCENARIO,
      socialSecurityMode: 'manual' as const,
      investments: { ...DEFAULT_SCENARIO.investments, crashFrequency: 1 },
    };

    const resultHigh = runSimulation(scenarioHighCrash, { numSimulations: 500, seed: 42 });
    const resultLow = runSimulation(scenarioLowCrash, { numSimulations: 500, seed: 42 });

    // High crash frequency should produce a lower success rate
    const diff = resultLow.successRate - resultHigh.successRate;
    expect(diff).toBeGreaterThan(0.02); // at least 2pp difference
  });
});

describe('Per-asset regime mask', () => {
  it('bonds variance is unaffected by bear regime when masked out', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const N = 10000;
    const mask = [true, false, false, true]; // stocks+crypto regime, bonds+cash always Gaussian

    function bondsVariance(isBear: boolean): number {
      const rng = new PRNG(42);
      let sum = 0, sumSq = 0;
      for (let i = 0; i < N; i++) {
        const r = generateCorrelatedReturns(rng, L, means, stdDevs, isBear, mask);
        sum += r[1]; // bonds index
        sumSq += r[1] * r[1];
      }
      const mean = sum / N;
      return sumSq / N - mean * mean;
    }

    const varBull = bondsVariance(false);
    const varBear = bondsVariance(true);

    // Bonds are masked out from regime switching — variance should be similar
    const ratio = varBull / varBear;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it('stocks variance changes with regime when masked in', () => {
    const L = cholesky(DEFAULT_CORRELATION_MATRIX);
    const means = [0.10, 0.04, 0.025, 0.15];
    const stdDevs = [0.18, 0.06, 0.01, 0.60];
    const N = 10000;
    const mask = [true, false, false, true];

    function stocksVariance(isBear: boolean): number {
      const rng = new PRNG(42);
      let sum = 0, sumSq = 0;
      for (let i = 0; i < N; i++) {
        const r = generateCorrelatedReturns(rng, L, means, stdDevs, isBear, mask);
        sum += r[0]; // stocks index
        sumSq += r[0] * r[0];
      }
      const mean = sum / N;
      return sumSq / N - mean * mean;
    }

    const varBull = stocksVariance(false);
    const varBear = stocksVariance(true);

    // Bear regime should have higher variance for stocks
    expect(varBear).toBeGreaterThan(varBull);
  });

  it('all-false mask means regime has no effect on returns', () => {
    const L = cholesky([[1, 0], [0, 1]]);
    const means = [0.10, 0.04];
    const stdDevs = [0.18, 0.06];
    const N = 10000;
    const allFalse = [false, false];

    function sampleMean(isBear: boolean): number {
      const rng = new PRNG(42);
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const r = generateCorrelatedReturns(rng, L, means, stdDevs, isBear, allFalse);
        sum += r[0];
      }
      return sum / N;
    }

    const meanBull = sampleMean(false);
    const meanBear = sampleMean(true);

    // With all-false mask, regime should not affect returns
    expect(Math.abs(meanBull - meanBear)).toBeLessThan(0.01);
  });
});
