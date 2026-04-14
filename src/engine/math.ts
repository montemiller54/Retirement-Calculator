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

  /** Chi-squared(df) using sum of squared normals */
  nextChiSquared(df: number): number {
    let sum = 0;
    for (let i = 0; i < df; i++) {
      const z = this.nextGaussian();
      sum += z * z;
    }
    return sum;
  }

  /** Student-t(df) = Z * sqrt(df / chi2(df)) */
  nextStudentT(df: number): number {
    const z = this.nextGaussian();
    const chi2 = this.nextChiSquared(df);
    return z * Math.sqrt(df / chi2);
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

// ── Generate correlated returns with per-asset distribution control ──
// Correlated normals via Cholesky; optionally scaled to Student-t per asset.
// fatTailMask[i] = true → Student-t(df), false → Gaussian. Default: all Student-t.
export function generateCorrelatedReturns(
  rng: PRNG,
  choleskyL: number[][],
  means: number[],
  stdDevs: number[],
  df: number,
  fatTailMask?: boolean[],
): number[] {
  const n = choleskyL.length;

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

  // Chi-squared scaling for Student-t assets (skip if all Gaussian)
  const anyFatTail = !fatTailMask || fatTailMask.some(v => v);
  let scale = 1;
  if (anyFatTail) {
    const chi2 = rng.nextChiSquared(df);
    scale = Math.sqrt(df / chi2);
  }

  const returns = new Array(n);
  for (let i = 0; i < n; i++) {
    // Student-t draw: lower df → fatter tails AND higher realized volatility.
    // We intentionally do NOT adjust for Student-t's higher variance (df/(df-2))
    // so that lower df produces genuinely riskier return paths.
    // Bonds/cash use Gaussian (scale=1) for academically accurate modeling.
    const assetScale = (!fatTailMask || fatTailMask[i]) ? scale : 1;
    returns[i] = means[i] + stdDevs[i] * correlated[i] * assetScale;
  }
  return returns;
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
