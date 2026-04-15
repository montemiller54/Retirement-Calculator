import type {
  AssetClass,
  AssetClassAssumption,
  AssetAllocation,
  AccountAllocations,
  RiskProfile,
} from '../types';

// Default expected returns and volatility per asset class
// Note: Stocks & crypto use Student-t(df=6) fat tails, which inflates effective
// volatility by √(df/(df-2)) ≈ 1.22×. Input stdDev is calibrated so that
// effective vol matches historical observations (~19.5% for stocks, ~61% for crypto).
export const DEFAULT_ASSET_RETURNS: Record<AssetClass, AssetClassAssumption> = {
  stocks: { mean: 0.10,  stdDev: 0.16 },
  bonds:  { mean: 0.04,  stdDev: 0.06 },
  cash:   { mean: 0.025, stdDev: 0.01 },
  crypto: { mean: 0.15,  stdDev: 0.50 },
};

// Correlation matrix (Stocks, Bonds, Cash, Crypto)
// Order matches ASSET_CLASSES array
export const DEFAULT_CORRELATION_MATRIX: number[][] = [
  [1.00, -0.10, 0.00, 0.30],  // Stocks
  [-0.10, 1.00, 0.20, -0.10], // Bonds
  [0.00,  0.20, 1.00, 0.00],  // Cash
  [0.30, -0.10, 0.00, 1.00],  // Crypto
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

export const DEFAULT_FAT_TAIL_DF = 6;
