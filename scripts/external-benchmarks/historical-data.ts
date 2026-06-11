/**
 * Loads cached annual real returns produced by fetch-data.ts.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data', 'historical-returns.json');

export interface HistoricalReturns {
  source: string;
  fetchedAt: string;
  years: number[];
  stocks: number[]; // real annual returns
  bonds: number[];  // real annual returns
  cpi: number[];    // CPI inflation
}

let cached: HistoricalReturns | null = null;

export function loadHistoricalReturns(): HistoricalReturns {
  if (cached) return cached;
  if (!existsSync(DATA_FILE)) {
    throw new Error(
      `Historical data not found at ${DATA_FILE}.\n` +
      `Run:  npx tsx scripts/external-benchmarks/fetch-data.ts`
    );
  }
  cached = JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as HistoricalReturns;
  return cached;
}
