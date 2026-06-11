/**
 * Bengen / Trinity-style historical rolling-window backtest.
 *
 * Replicates the methodology used by FIRECalc, cFIREsim, and Bengen's
 * original paper. For an N-year retirement, we test every contiguous
 * N-year window in the historical record. In each window we:
 *   1. Withdraw the year's real spending at the start of the year.
 *   2. Apply that year's real portfolio return.
 *   3. Repeat N times.
 *   4. Mark the window as "success" if the portfolio is still > 0 at the end.
 *
 * Returns are already real (inflation-adjusted), so spending stays constant
 * in real dollars across the window.
 */

import { loadHistoricalReturns } from './historical-data';
import type { ExternalScenario } from './scenarios';

export interface BengenResult {
  successRate: number;       // 0..1
  windowsTested: number;
  failures: number;
  medianEndingBalance: number;
  p10EndingBalance: number;
  worstEndingBalance: number;
  safemaxRate: number;       // highest withdrawal rate with 100% success
}

export function runBengen(scenario: ExternalScenario): BengenResult {
  const hist = loadHistoricalReturns();
  const n = hist.years.length;
  const windowSize = scenario.years;
  if (windowSize > n) {
    throw new Error(`Need ${windowSize} years of history, only have ${n}`);
  }

  const endingBalances: number[] = [];
  let failures = 0;

  for (let start = 0; start + windowSize <= n; start++) {
    let balance = scenario.initialBalance;
    for (let k = 0; k < windowSize; k++) {
      // Withdraw at start of year (real dollars stay constant)
      balance -= scenario.annualSpending;
      if (balance <= 0) {
        balance = 0;
        break;
      }
      // Apply blended real return
      const r =
        scenario.stockPct * hist.stocks[start + k] +
        scenario.bondPct * hist.bonds[start + k];
      balance = balance * (1 + r);
    }
    endingBalances.push(balance);
    if (balance <= 0) failures++;
  }

  endingBalances.sort((a, b) => a - b);
  const median = endingBalances[Math.floor(endingBalances.length / 2)];
  const p10 = endingBalances[Math.floor(endingBalances.length * 0.10)];
  const worst = endingBalances[0];

  // SAFEMAX: binary search highest withdrawal rate with 100% success
  const safemaxRate = findSafemax(scenario, hist);

  return {
    successRate: 1 - failures / endingBalances.length,
    windowsTested: endingBalances.length,
    failures,
    medianEndingBalance: median,
    p10EndingBalance: p10,
    worstEndingBalance: worst,
    safemaxRate,
  };
}

function findSafemax(scenario: ExternalScenario, hist: ReturnType<typeof loadHistoricalReturns>): number {
  // Binary search withdrawal rate where success == 100% across all windows
  let lo = 0.01;
  let hi = 0.10;
  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2;
    const spending = scenario.initialBalance * mid;
    const ok = allWindowsSurvive(scenario, hist, spending);
    if (ok) lo = mid; else hi = mid;
  }
  return lo;
}

function allWindowsSurvive(
  scenario: ExternalScenario,
  hist: ReturnType<typeof loadHistoricalReturns>,
  annualSpending: number,
): boolean {
  const n = hist.years.length;
  for (let start = 0; start + scenario.years <= n; start++) {
    let balance = scenario.initialBalance;
    for (let k = 0; k < scenario.years; k++) {
      balance -= annualSpending;
      if (balance <= 0) return false;
      const r =
        scenario.stockPct * hist.stocks[start + k] +
        scenario.bondPct * hist.bonds[start + k];
      balance = balance * (1 + r);
    }
  }
  return true;
}
