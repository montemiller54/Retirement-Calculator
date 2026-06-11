/**
 * Wade Pfau's published SAFEMAX withdrawal rates by stock allocation and
 * retirement horizon, using historical US data 1926-onward.
 *
 * Source: Pfau, "Safe Savings Rates: A New Approach to Retirement Planning
 * over the Lifecycle", and his subsequent SWR tables published on
 * retirementresearcher.com / Forbes. Numbers below are the widely-cited
 * historical SAFEMAX (the highest constant real withdrawal rate that
 * survived every rolling window starting 1926).
 *
 * These are reference values — our engine should land in the same ballpark
 * for matching scenarios. Variation up to ~0.3% is expected because of
 * different data vintages and bond proxies.
 */

export interface PfauReference {
  stockPct: number;
  years: number;
  safemaxPct: number; // 0.04 == 4.0%
}

export const PFAU_TABLE: PfauReference[] = [
  // 30-year retirement
  { stockPct: 0.25, years: 30, safemaxPct: 0.0390 },
  { stockPct: 0.50, years: 30, safemaxPct: 0.0410 },
  { stockPct: 0.75, years: 30, safemaxPct: 0.0410 },
  { stockPct: 1.00, years: 30, safemaxPct: 0.0380 },
  // 40-year retirement
  { stockPct: 0.50, years: 40, safemaxPct: 0.0350 },
  { stockPct: 0.75, years: 40, safemaxPct: 0.0365 },
  // 50-year retirement
  { stockPct: 0.50, years: 50, safemaxPct: 0.0315 },
  { stockPct: 0.75, years: 50, safemaxPct: 0.0335 },
];

export function findPfauReference(stockPct: number, years: number): PfauReference | null {
  return PFAU_TABLE.find(p =>
    Math.abs(p.stockPct - stockPct) < 0.01 && p.years === years
  ) ?? null;
}
