/**
 * Canonical scenarios used by every external-benchmark engine so we can
 * line up apples-to-apples comparisons.
 *
 * Each scenario is intentionally simple (single pool, no SS/pension/taxes,
 * constant-real-dollar spending) so it can be replicated in Bengen-style
 * historical engines, Pfau tables, and our Monte Carlo engine.
 */

export interface ExternalScenario {
  id: string;
  description: string;
  initialBalance: number;
  annualSpending: number; // year-1 real dollars; held constant in real terms
  years: number;
  stockPct: number;       // 0..1
  bondPct: number;        // 0..1
}

export const CANONICAL_SCENARIOS: ExternalScenario[] = [
  {
    id: 'bengen-classic-50-50',
    description: 'Bengen classic: $1M, 50/50, 4% rule, 30 years',
    initialBalance: 1_000_000,
    annualSpending: 40_000,
    years: 30,
    stockPct: 0.50,
    bondPct: 0.50,
  },
  {
    id: 'trinity-75-25',
    description: 'Trinity-style: $1M, 75/25, 4% rule, 30 years',
    initialBalance: 1_000_000,
    annualSpending: 40_000,
    years: 30,
    stockPct: 0.75,
    bondPct: 0.25,
  },
  {
    id: 'conservative-60-40-3pct',
    description: 'Conservative: $1M, 60/40, 3% rule, 30 years',
    initialBalance: 1_000_000,
    annualSpending: 30_000,
    years: 30,
    stockPct: 0.60,
    bondPct: 0.40,
  },
  {
    id: 'aggressive-60-40-5pct',
    description: 'Aggressive: $1M, 60/40, 5% rule, 30 years',
    initialBalance: 1_000_000,
    annualSpending: 50_000,
    years: 30,
    stockPct: 0.60,
    bondPct: 0.40,
  },
  {
    id: 'long-horizon-fire',
    description: 'FIRE: $1M, 75/25, 4% rule, 50 years',
    initialBalance: 1_000_000,
    annualSpending: 40_000,
    years: 50,
    stockPct: 0.75,
    bondPct: 0.25,
  },
];

/**
 * Scenarios used specifically for Guyton-Klinger comparisons.
 * G&K's published results target 65/35 over 30-40 years; we mirror that.
 * `annualSpending` is set later by the harness using the initial WR being tested.
 */
export const GK_SCENARIOS: ExternalScenario[] = [
  {
    id: 'gk-65-35-30y',
    description: 'Guyton-Klinger: $1M, 65/35, 30 years',
    initialBalance: 1_000_000,
    annualSpending: 0, // overridden per IWR
    years: 30,
    stockPct: 0.65,
    bondPct: 0.35,
  },
  {
    id: 'gk-65-35-40y',
    description: 'Guyton-Klinger: $1M, 65/35, 40 years',
    initialBalance: 1_000_000,
    annualSpending: 0,
    years: 40,
    stockPct: 0.65,
    bondPct: 0.35,
  },
  {
    id: 'gk-50-50-30y',
    description: 'Guyton-Klinger: $1M, 50/50, 30 years',
    initialBalance: 1_000_000,
    annualSpending: 0,
    years: 30,
    stockPct: 0.50,
    bondPct: 0.50,
  },
];
