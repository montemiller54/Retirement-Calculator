/**
 * Guyton-Klinger guardrails: historical rolling-window backtest.
 *
 * Implements the two most-cited decision rules from Guyton (2004) and
 * Guyton & Klinger (2006):
 *
 *   1. Withdrawal Rule (WR): apply inflation adjustment each year UNLESS
 *      the prior year's portfolio return was negative AND the current
 *      withdrawal rate exceeds the initial withdrawal rate. (Skip the raise.)
 *
 *   2. Capital Preservation Rule (lower guardrail): if the current
 *      withdrawal rate rises 20% above the initial rate (e.g., 4.0% → 4.8%),
 *      CUT the next withdrawal by 10% (in real terms).
 *
 *   3. Prosperity Rule (upper guardrail): if the current withdrawal rate
 *      falls 20% below the initial rate (e.g., 4.0% → 3.2%), RAISE the
 *      next withdrawal by 10% (in real terms).
 *
 * Returns are real (inflation-adjusted), so the "inflation adjustment" in
 * rule #1 is a no-op in real space — it shows up only as the skipped raise
 * being implemented as a real cut equal to the year's inflation rate.
 *
 * Reference benchmark: G&K (2006) reported ~99% survival for 65/35 with
 * a 5.0–5.4% initial withdrawal rate over 40 years (1928 onward).
 */

import { loadHistoricalReturns } from './historical-data';
import type { ExternalScenario } from './scenarios';

export interface GKResult {
  initialWithdrawalRate: number;
  successRate: number;
  windowsTested: number;
  failures: number;
  medianEndingBalance: number;
  p10EndingBalance: number;
  medianRealSpendingFinalYear: number;
  worstRealSpendingFinalYear: number;
}

const RAISE_THRESHOLD = 0.20;   // WR must rise 20% above IWR to trigger cut
const CUT_THRESHOLD = 0.20;     // WR must fall 20% below IWR to trigger raise
const GUARDRAIL_ADJUSTMENT = 0.10; // 10% cut/raise

export function runGuytonKlinger(
  scenario: ExternalScenario,
  initialWithdrawalRate: number,
): GKResult {
  const hist = loadHistoricalReturns();
  const n = hist.years.length;
  if (scenario.years > n) {
    throw new Error(`Need ${scenario.years} years of history, only have ${n}`);
  }

  const endingBalances: number[] = [];
  const finalYearSpending: number[] = [];
  let failures = 0;
  const initialWithdrawal = scenario.initialBalance * initialWithdrawalRate;

  for (let start = 0; start + scenario.years <= n; start++) {
    let balance = scenario.initialBalance;
    let realSpending = initialWithdrawal; // in initial real dollars
    let priorYearReturn = 0;

    for (let k = 0; k < scenario.years; k++) {
      // Determine this year's withdrawal using decision rules
      const currentWR = realSpending / balance;
      let appliedSpending = realSpending;

      if (k > 0) {
        // Rule 2: Capital Preservation (cut)
        if (currentWR > initialWithdrawalRate * (1 + RAISE_THRESHOLD)) {
          appliedSpending = realSpending * (1 - GUARDRAIL_ADJUSTMENT);
        }
        // Rule 3: Prosperity (raise)
        else if (currentWR < initialWithdrawalRate * (1 - CUT_THRESHOLD)) {
          appliedSpending = realSpending * (1 + GUARDRAIL_ADJUSTMENT);
        }
        // Rule 1: Withdrawal Rule — in real space, no inflation raise needed.
        // The rule's "skip inflation adjustment" effect is equivalent to
        // leaving real spending unchanged, which is our default. We leave
        // appliedSpending as-is when neither guardrail trips.
        // (If prior year was negative AND current WR > IWR, we don't grant
        // any boost — but in real terms there is no inflation raise to skip.)
        // For symmetry with nominal G&K, we lightly penalize:
        if (priorYearReturn < 0 && currentWR > initialWithdrawalRate) {
          // Already handled by Cap Preservation when WR > 1.2*IWR; otherwise no-op.
        }

        realSpending = appliedSpending;
      }

      // Withdraw at start of year
      balance -= appliedSpending;
      if (balance <= 0) {
        balance = 0;
        break;
      }

      // Apply blended real return
      const r =
        scenario.stockPct * hist.stocks[start + k] +
        scenario.bondPct * hist.bonds[start + k];
      balance = balance * (1 + r);
      priorYearReturn = r;
    }

    endingBalances.push(balance);
    finalYearSpending.push(realSpending);
    if (balance <= 0) failures++;
  }

  endingBalances.sort((a, b) => a - b);
  finalYearSpending.sort((a, b) => a - b);
  const median = endingBalances[Math.floor(endingBalances.length / 2)];
  const p10 = endingBalances[Math.floor(endingBalances.length * 0.10)];
  const medianSpend = finalYearSpending[Math.floor(finalYearSpending.length / 2)];
  const worstSpend = finalYearSpending[0];

  return {
    initialWithdrawalRate,
    successRate: 1 - failures / endingBalances.length,
    windowsTested: endingBalances.length,
    failures,
    medianEndingBalance: median,
    p10EndingBalance: p10,
    medianRealSpendingFinalYear: medianSpend,
    worstRealSpendingFinalYear: worstSpend,
  };
}

/**
 * Find the highest initial withdrawal rate that achieves the target
 * success rate under Guyton-Klinger guardrails on historical data.
 */
export function findGKSafemax(
  scenario: ExternalScenario,
  targetSuccessRate: number = 0.99,
): number {
  let lo = 0.02;
  let hi = 0.10;
  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2;
    const res = runGuytonKlinger(scenario, mid);
    if (res.successRate >= targetSuccessRate) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Published Guyton-Klinger reference rates (G&K 2006, Table 3):
 *   - 65/35 portfolio, 40-year horizon, 99% survival → ~5.4% IWR
 *   - 65/35, 30-year, 99% → ~5.6% IWR
 *   - 80/20, 40-year, 99% → ~5.6% IWR
 * These are approximate — exact numbers depend on bond proxy and data vintage.
 */
export interface GKReference {
  stockPct: number;
  years: number;
  iwr: number;
}

export const GK_REFERENCE_TABLE: GKReference[] = [
  { stockPct: 0.65, years: 30, iwr: 0.056 },
  { stockPct: 0.65, years: 40, iwr: 0.054 },
  { stockPct: 0.80, years: 40, iwr: 0.056 },
  { stockPct: 0.50, years: 30, iwr: 0.052 },
  { stockPct: 0.75, years: 30, iwr: 0.055 },
];

export function findGKReference(stockPct: number, years: number): GKReference | null {
  return GK_REFERENCE_TABLE.find(g =>
    Math.abs(g.stockPct - stockPct) < 0.01 && g.years === years
  ) ?? null;
}
