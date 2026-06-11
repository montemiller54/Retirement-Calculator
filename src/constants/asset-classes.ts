import type {
  AssetClass,
  AssetClassAssumption,
  AssetAllocation,
  AccountAllocations,
  RiskProfile,
} from '../types';

// Default expected returns and volatility per asset class
// Default expected returns and volatility per asset class (nominal).
// Stocks & crypto use regime-switching (bull/bear) for mean/vol;
// bonds & cash always use these base values (except bear bond mean boost).
export const DEFAULT_ASSET_RETURNS: Record<AssetClass, AssetClassAssumption> = {
  stocks: { mean: 0.10,  stdDev: 0.16 },
  bonds:  { mean: 0.04,  stdDev: 0.06 },
  cash:   { mean: 0.025, stdDev: 0.01 },
  crypto: { mean: 0.15,  stdDev: 0.50 },
};

// Bull-regime correlation matrix (Stocks, Bonds, Cash, Crypto)
// Order matches ASSET_CLASSES array
export const DEFAULT_CORRELATION_MATRIX: number[][] = [
  [1.00, -0.10, 0.00, 0.30],  // Stocks
  [-0.10, 1.00, 0.20, -0.10], // Bonds
  [0.00,  0.20, 1.00, 0.00],  // Cash
  [0.30, -0.10, 0.00, 1.00],  // Crypto
];

// Bear-regime correlation matrix: stronger negative stock-bond correlation
// (flight to quality) and tighter stock-crypto correlation (risk-off selling).
export const BEAR_CORRELATION_MATRIX: number[][] = [
  [1.00, -0.35, 0.00, 0.50],  // Stocks
  [-0.35, 1.00, 0.20, -0.15], // Bonds
  [0.00,  0.20, 1.00, 0.00],  // Cash
  [0.50, -0.15, 0.00, 1.00],  // Crypto
];

// Risk profile presets (single allocation applied to all accounts)
const CONSERVATIVE: AssetAllocation = {
  stocks: 35,
  bonds: 50,
  cash: 15,
  crypto: 0,
};

const BALANCED: AssetAllocation = {
  stocks: 60,
  bonds: 30,
  cash: 10,
  crypto: 0,
};

const AGGRESSIVE: AssetAllocation = {
  stocks: 80,
  bonds: 15,
  cash: 5,
  crypto: 0,
};

export const RISK_PROFILES: Record<RiskProfile, AssetAllocation> = {
  conservative: CONSERVATIVE,
  balanced: BALANCED,
  aggressive: AGGRESSIVE,
};

export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
};

// Build uniform AccountAllocations from a single allocation
export function makeUniformAllocations(alloc: AssetAllocation): AccountAllocations {
  return {
    traditional401k: { ...alloc },
    roth401k: { ...alloc },
    traditionalIRA: { ...alloc },
    rothIRA: { ...alloc },
    taxable: { ...alloc },
    hsa: { ...alloc },
    cashAccount: { ...alloc },
    otherAssets: { ...alloc },
  };
}

export const DEFAULT_CRASH_FREQUENCY = 5.5; // slider midpoint → ~18% bear years (historical average)

// ── Markov regime-switching parameters ──
// Calibrated to S&P 500 annual returns 1926-2025.
// Bull regime: ~82% of years historically.  Bear regime: ~18%.
// Bear persistence P(bear|bear) = 0.55 → avg bear streak ~2.2 years,
// matching historical bear market duration (1929-32, 1973-74, 2000-02, 2007-09).
export const BULL_REGIME = { mean: 0.159, vol: 0.15 };
export const BEAR_REGIME = { mean: -0.14,  vol: 0.20 };
export const BEAR_PERSISTENCE = 0.40; // P(stay in bear | currently bear) — was 0.55, lowered to reduce long-cluster artifact

// Hard cap on consecutive bear-regime years. Historical US data (1928+) has
// never produced more than 3 consecutive negative-real-return years for a 75/25
// portfolio; 1929-32 was the worst at 4. After this many years in bear, force
// an exit to bull (which then triggers the normal post-bear recovery).
export const MAX_BEAR_DURATION = 4;

// Bonds get a mild mean boost in bear years (central bank rate cuts + flight to quality).
// Historical avg bond return during stock bear years: ~5-7%. Normal: ~4%.
export const BEAR_BOND_MEAN = 0.065;

// Post-bear recovery: the first 1-2 bull years after exiting a bear regime get
// an elevated mean, reflecting historical snapbacks (1933 +50%, 1954 +53%,
// 1975 +37%, 2003 +29%, 2009 +26%). Magnitude scales with bear duration:
// longer/deeper bears produce stronger bounces. The boost applies on top of
// the standard bull-regime mean. Values reflect the *average* post-bear bull
// year, not the peak — the bull mean (15.9%) already includes snapback years.
export const POST_BEAR_RECOVERY_YEAR1_MEAN = 0.22; // mean for first bull year after bear
export const POST_BEAR_RECOVERY_YEAR2_MEAN = 0.18; // mean for second bull year after a 2+ year bear

