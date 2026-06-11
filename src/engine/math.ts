// ── Seeded PRNG (SFC32 — Small Fast Counter, passes PractRand) ──
// Period ~2^128, designed for 32-bit operations
export class PRNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    // Initialize all four state words from seed via splitmix32 mixing
    seed = seed | 0;
    this.a = this.splitmix(seed);
    this.b = this.splitmix(this.a);
    this.c = this.splitmix(this.b);
    this.d = this.splitmix(this.c);
    // Warm up: discard first 15 values to mix state thoroughly
    for (let i = 0; i < 15; i++) this.next();
  }

  private splitmix(x: number): number {
    x = ((x >>> 16) ^ x) * 0x45d9f3b | 0;
    x = ((x >>> 16) ^ x) * 0x45d9f3b | 0;
    x = (x >>> 16) ^ x;
    return x; 
  }

  /** Returns a uniform random in [0, 1) */
  next(): number {
    const t = (this.a + this.b | 0) + this.d | 0;
    this.d = this.d + 1 | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = this.c + (this.c << 3) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = this.c + t | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Standard normal via Box-Muller */
  nextGaussian(): number {
    let u1 = this.next();
    let u2 = this.next();
    // Avoid log(0)
    while (u1 === 0) u1 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ── Cholesky decomposition ──
// Returns lower-triangular matrix L such that L * L^T = A
export function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(0, val));
      } else {
        L[i][j] = L[j][j] === 0 ? 0 : (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

// ── Generate correlated returns with regime-switching ──
// Uses Cholesky-correlated Gaussians. In bear years, assets in the regimeMask
// have their mean/vol replaced with bear-regime values, producing realistic
// crashes without impossible >-100% returns.
import { BULL_REGIME, BEAR_REGIME, DEFAULT_ASSET_RETURNS } from '../constants/asset-classes';
import { ASSET_CLASSES } from '../types';

// Per-asset deltas for user-tunable regime shifts.
// User's "Avg Return %" and variability inputs shift both bull and bear regimes
// uniformly: mean delta is added, stdDev is scaled by the user/default ratio.
// When user keeps defaults, delta=0 and ratio=1 → engine uses BULL/BEAR_REGIME exactly.
const DEFAULT_REGIME_MEANS = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].mean);
const DEFAULT_REGIME_STDDEVS = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].stdDev);

export function generateCorrelatedReturns(
  rng: PRNG,
  choleskyL: number[][],
  means: number[],
  stdDevs: number[],
  isBearYear: boolean,
  regimeMask?: boolean[],
  recoveryBoostMean?: number,
): number[] {
  const n = choleskyL.length;

  // Determine effective means and stdDevs for this year's regime
  const effMeans = new Array(n);
  const effStdDevs = new Array(n);
  for (let i = 0; i < n; i++) {
    const useRegime = !regimeMask || regimeMask[i];
    if (useRegime) {
      // Regime-switching asset: user mean/stdDev shifts both regimes uniformly.
      // delta=0 / ratio=1 when user keeps defaults, so calibration is preserved.
      const defaultMean = i < DEFAULT_REGIME_MEANS.length ? DEFAULT_REGIME_MEANS[i] : means[i];
      const defaultStdDev = i < DEFAULT_REGIME_STDDEVS.length ? DEFAULT_REGIME_STDDEVS[i] : stdDevs[i];
      const meanDelta = means[i] - defaultMean;
      const stdRatio = defaultStdDev > 0 ? stdDevs[i] / defaultStdDev : 1;
      if (isBearYear) {
        effMeans[i] = BEAR_REGIME.mean + meanDelta;
        effStdDevs[i] = BEAR_REGIME.vol * stdRatio;
      } else {
        // Post-bear recovery overrides the standard bull mean for this year only
        effMeans[i] = (recoveryBoostMean ?? BULL_REGIME.mean) + meanDelta;
        effStdDevs[i] = BULL_REGIME.vol * stdRatio;
      }
    } else {
      effMeans[i] = means[i];
      effStdDevs[i] = stdDevs[i];
    }
  }

  // Generate independent standard normal draws
  const z = new Array(n);
  for (let i = 0; i < n; i++) z[i] = rng.nextGaussian();

  // Apply Cholesky to get correlated normals
  const correlated = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      sum += choleskyL[i][j] * z[j];
    }
    correlated[i] = sum;
  }

  const returns = new Array(n);
  for (let i = 0; i < n; i++) {
    returns[i] = Math.max(-1, effMeans[i] + effStdDevs[i] * correlated[i]);
  }
  return returns;
}

// ── Crash frequency slider → steady-state bear probability ──
// Slider 1 → 5% bear years (optimistic), 5.5 → 18% (historical), 10 → 30% (pessimistic)
export function crashFrequencyToSteadyState(cf: number): number {
  return 0.05 + (cf - 1) * (0.25 / 9);
}

// ── Blended return for an account ──
export function blendedReturn(
  assetReturns: number[],
  allocation: number[], // percentages (0-100)
): number {
  let ret = 0;
  for (let i = 0; i < assetReturns.length; i++) {
    ret += assetReturns[i] * (allocation[i] / 100);
  }
  return ret;
}
