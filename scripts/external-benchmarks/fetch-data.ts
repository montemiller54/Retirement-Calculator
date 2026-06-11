/**
 * Fetches Robert Shiller's monthly S&P 500 data from DataHub and computes
 * annual real total returns for stocks and 10-year Treasury bonds.
 *
 * Source: https://datahub.io/core/s-and-p-500 (mirror of http://www.econ.yale.edu/~shiller/data.htm)
 *
 * Output: scripts/external-benchmarks/data/historical-returns.json
 *   { years: number[], stocks: number[], bonds: number[], cpi: number[] }
 *   Values are decimal real annual returns (0.10 = +10%).
 *
 * Bond returns are approximated from 10yr Treasury yields using a constant
 * duration model: r_t ≈ y_{t-1} + D * (y_{t-1} - y_t), with D = 7 years.
 *
 * Usage:  npx tsx scripts/external-benchmarks/fetch-data.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const OUTPUT_FILE = join(DATA_DIR, 'historical-returns.json');

const SHILLER_URL = 'https://datahub.io/core/s-and-p-500/r/data.csv';
const BOND_DURATION = 7; // approximate Macaulay duration of 10yr Treasury

interface ShillerRow {
  date: string;      // YYYY-MM-DD
  year: number;
  month: number;
  sp500: number;     // nominal price level
  dividend: number;  // trailing 12-month annualized dividend
  cpi: number;       // Consumer Price Index
  longRate: number;  // 10-year Treasury yield (%)
}

function parseCsv(text: string): ShillerRow[] {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim());
  const idx = {
    date: header.indexOf('Date'),
    sp500: header.indexOf('SP500'),
    dividend: header.indexOf('Dividend'),
    cpi: header.indexOf('Consumer Price Index'),
    longRate: header.indexOf('Long Interest Rate'),
  };
  if (Object.values(idx).some(i => i < 0)) {
    throw new Error(`Unexpected CSV header: ${header.join(',')}`);
  }
  const rows: ShillerRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const date = cols[idx.date];
    const [y, m] = date.split('-').map(Number);
    const sp500 = parseFloat(cols[idx.sp500]);
    const dividend = parseFloat(cols[idx.dividend]);
    const cpi = parseFloat(cols[idx.cpi]);
    const longRate = parseFloat(cols[idx.longRate]);
    if ([sp500, dividend, cpi, longRate].some(v => !isFinite(v))) continue;
    rows.push({ date, year: y, month: m, sp500, dividend, cpi, longRate });
  }
  return rows;
}

function computeAnnualReturns(rows: ShillerRow[]): {
  years: number[]; stocks: number[]; bonds: number[]; cpi: number[];
} {
  // Use December rows as year-end snapshots
  const decemberByYear = new Map<number, ShillerRow>();
  for (const r of rows) {
    if (r.month === 12) decemberByYear.set(r.year, r);
  }
  const sortedYears = [...decemberByYear.keys()].sort((a, b) => a - b);

  const years: number[] = [];
  const stocks: number[] = [];
  const bonds: number[] = [];
  const cpi: number[] = [];

  for (let i = 1; i < sortedYears.length; i++) {
    const yEnd = sortedYears[i];
    const yStart = sortedYears[i - 1];
    if (yEnd - yStart !== 1) continue; // require contiguous years

    const r0 = decemberByYear.get(yStart)!;
    const r1 = decemberByYear.get(yEnd)!;

    // Nominal stock total return: price change + dividend yield on start price
    const priceReturn = (r1.sp500 - r0.sp500) / r0.sp500;
    const divYield = r1.dividend / r0.sp500;
    const nominalStock = priceReturn + divYield;

    // CPI inflation
    const inflation = (r1.cpi - r0.cpi) / r0.cpi;

    // Bond return from yield change (duration model). Yields are in percent.
    const y0 = r0.longRate / 100;
    const y1 = r1.longRate / 100;
    const nominalBond = y0 + BOND_DURATION * (y0 - y1);

    // Convert to real returns
    const realStock = (1 + nominalStock) / (1 + inflation) - 1;
    const realBond = (1 + nominalBond) / (1 + inflation) - 1;

    if (![realStock, realBond, inflation].every(v => isFinite(v))) continue;

    years.push(yEnd);
    stocks.push(realStock);
    bonds.push(realBond);
    cpi.push(inflation);
  }
  return { years, stocks, bonds, cpi };
}

async function main() {
  console.log(`Fetching ${SHILLER_URL} ...`);
  const res = await fetch(SHILLER_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} monthly rows (${rows[0]?.date} → ${rows[rows.length - 1]?.date}).`);

  const annual = computeAnnualReturns(rows);
  console.log(`Computed ${annual.years.length} annual real returns (${annual.years[0]} → ${annual.years[annual.years.length - 1]}).`);

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify({
    source: SHILLER_URL,
    bondDuration: BOND_DURATION,
    fetchedAt: new Date().toISOString(),
    ...annual,
  }, null, 2));
  console.log(`Wrote ${OUTPUT_FILE}`);

  // Sanity checks
  const meanStock = annual.stocks.reduce((s, x) => s + x, 0) / annual.stocks.length;
  const meanBond = annual.bonds.reduce((s, x) => s + x, 0) / annual.bonds.length;
  console.log(`\nMean real stock return: ${(meanStock * 100).toFixed(2)}% (Damodaran ~6.8% since 1928)`);
  console.log(`Mean real bond  return: ${(meanBond * 100).toFixed(2)}% (Damodaran ~2.0% since 1928)`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
