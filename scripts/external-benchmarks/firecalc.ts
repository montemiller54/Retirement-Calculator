/**
 * Optional: hit FIRECalc.com programmatically and parse the success rate
 * from the HTML response. Best-effort — disabled by default because:
 *   - HTML scraping is fragile
 *   - rate-limiting may apply
 *   - FIRECalc's ToS should be reviewed before automating
 *
 * Enable with:  RUN_FIRECALC=1 npx tsx scripts/external-benchmarks/run.ts
 */

import type { ExternalScenario } from './scenarios';

const FIRECALC_URL = 'https://www.firecalc.com/index.php';

export interface FirecalcResult {
  successRate: number;
  cyclesTotal: number;
  cyclesFailed: number;
}

export async function runFirecalc(s: ExternalScenario): Promise<FirecalcResult> {
  const body = new URLSearchParams({
    wdamt: String(Math.round(s.annualSpending)),
    PortValue: String(Math.round(s.initialBalance)),
    yrs: String(s.years),
    // FIRECalc default: 75/25 stocks/bonds, total market. Allocation can't
    // be set through the basic form — caller should note this caveat.
    submit: 'Submit',
  });

  const res = await fetch(FIRECALC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`FIRECalc HTTP ${res.status}`);
  const html = await res.text();

  // Parse the standard FIRECalc result phrasing:
  // "X cycles failed, for a success rate of Y.Y%"
  const m = html.match(/(\d+)\s+cycles?\s+(?:failed|succeeded)[^%]+?(\d+\.\d+)\s*%/i);
  if (!m) {
    // Try alternate phrasing
    const m2 = html.match(/success rate of\s+(\d+\.\d+)\s*%/i);
    if (!m2) throw new Error('Could not parse FIRECalc response');
    return { successRate: parseFloat(m2[1]) / 100, cyclesTotal: 0, cyclesFailed: 0 };
  }
  const failed = parseInt(m[1], 10);
  const successPct = parseFloat(m[2]);
  return {
    successRate: successPct / 100,
    cyclesTotal: Math.round(failed / Math.max(0.0001, 1 - successPct / 100)),
    cyclesFailed: failed,
  };
}
