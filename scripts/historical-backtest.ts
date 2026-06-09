/**
 * Historical Backtest
 *
 * Validates our Monte Carlo regime model against actual 1928-2024 historical
 * market sequences. Two questions we answer:
 *
 *   1. Does our HISTORICAL DATA reproduce known Trinity Study results?
 *      (sanity check on the data, no taxes, simple model)
 *   2. Is our Monte Carlo's tail (worst-case) within shouting distance of
 *      the actual historical worst-case sequences (1929, 1937, 1966, 1973)?
 *
 * Source for historical annual returns: Aswath Damodaran (NYU Stern),
 * "Historical Returns on Stocks, Bonds and Bills" dataset, 1928-2024.
 * Values are nominal annual total returns in percent. Inflation is CPI YoY.
 */

import { runSimulation } from '../src/engine/simulation';
import type { ScenarioInput, AssetAllocation } from '../src/types';
import { DEFAULT_SCENARIO } from '../src/constants/defaults';
import { makeUniformAllocations, DEFAULT_ASSET_RETURNS, DEFAULT_CRASH_FREQUENCY } from '../src/constants/asset-classes';

// ─── Scenario helpers (mirror benchmark-comparison.ts) ───────────────────
function scenario(overrides: Partial<ScenarioInput>): ScenarioInput {
  return { ...DEFAULT_SCENARIO, ...overrides };
}
const OFF_GUARDRAILS = { ...DEFAULT_SCENARIO.guardrails, enabled: false };
const OFF_HEALTHCARE = { ...DEFAULT_SCENARIO.healthcare, enabled: false };
const OFF_ROTH = { ...DEFAULT_SCENARIO.rothConversion, enabled: false };
const OFF_BUFFER = { ...DEFAULT_SCENARIO.cashBuffer, enabled: false };
function zeroBalances() {
  return {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };
}
function alloc(stocks: number, bonds: number, cashPct: number = 0): AssetAllocation {
  return { stocks, bonds, cash: cashPct, crypto: 0 };
}

// ─── Historical Annual Returns 1928-2024 ─────────────────────────────────
// Columns: year, S&P 500 total return, 10-yr Treasury total return,
// 3-month T-bill, CPI inflation (all annual nominal, expressed as decimals)
// Source: Damodaran NYU Stern historical returns dataset.
interface HistRow { year: number; stocks: number; bonds: number; cash: number; cpi: number }
const HISTORY: HistRow[] = [
  { year: 1928, stocks:  0.4381, bonds:  0.0084, cash: 0.0308, cpi: -0.0115 },
  { year: 1929, stocks: -0.0830, bonds:  0.0420, cash: 0.0316, cpi:  0.0058 },
  { year: 1930, stocks: -0.2512, bonds:  0.0454, cash: 0.0455, cpi: -0.0640 },
  { year: 1931, stocks: -0.4384, bonds: -0.0256, cash: 0.0231, cpi: -0.0932 },
  { year: 1932, stocks: -0.0864, bonds:  0.0879, cash: 0.0107, cpi: -0.1027 },
  { year: 1933, stocks:  0.4998, bonds:  0.0186, cash: 0.0096, cpi:  0.0076 },
  { year: 1934, stocks: -0.0119, bonds:  0.0796, cash: 0.0032, cpi:  0.0152 },
  { year: 1935, stocks:  0.4674, bonds:  0.0447, cash: 0.0018, cpi:  0.0299 },
  { year: 1936, stocks:  0.3194, bonds:  0.0502, cash: 0.0017, cpi:  0.0145 },
  { year: 1937, stocks: -0.3534, bonds:  0.0138, cash: 0.0030, cpi:  0.0286 },
  { year: 1938, stocks:  0.2928, bonds:  0.0421, cash: 0.0008, cpi: -0.0278 },
  { year: 1939, stocks: -0.0110, bonds:  0.0441, cash: 0.0004, cpi:  0.0000 },
  { year: 1940, stocks: -0.1067, bonds:  0.0540, cash: 0.0003, cpi:  0.0071 },
  { year: 1941, stocks: -0.1277, bonds: -0.0202, cash: 0.0008, cpi:  0.0993 },
  { year: 1942, stocks:  0.1917, bonds:  0.0229, cash: 0.0034, cpi:  0.0903 },
  { year: 1943, stocks:  0.2506, bonds:  0.0249, cash: 0.0038, cpi:  0.0296 },
  { year: 1944, stocks:  0.1903, bonds:  0.0258, cash: 0.0038, cpi:  0.0230 },
  { year: 1945, stocks:  0.3582, bonds:  0.0380, cash: 0.0038, cpi:  0.0225 },
  { year: 1946, stocks: -0.0843, bonds:  0.0313, cash: 0.0038, cpi:  0.1813 },
  { year: 1947, stocks:  0.0520, bonds:  0.0092, cash: 0.0057, cpi:  0.0884 },
  { year: 1948, stocks:  0.0570, bonds:  0.0195, cash: 0.0102, cpi:  0.0299 },
  { year: 1949, stocks:  0.1830, bonds:  0.0466, cash: 0.0110, cpi: -0.0207 },
  { year: 1950, stocks:  0.3081, bonds:  0.0043, cash: 0.0117, cpi:  0.0593 },
  { year: 1951, stocks:  0.2368, bonds: -0.0030, cash: 0.0148, cpi:  0.0600 },
  { year: 1952, stocks:  0.1815, bonds:  0.0227, cash: 0.0167, cpi:  0.0075 },
  { year: 1953, stocks: -0.0121, bonds:  0.0414, cash: 0.0189, cpi:  0.0075 },
  { year: 1954, stocks:  0.5256, bonds:  0.0329, cash: 0.0096, cpi: -0.0074 },
  { year: 1955, stocks:  0.3260, bonds: -0.0134, cash: 0.0166, cpi:  0.0037 },
  { year: 1956, stocks:  0.0744, bonds: -0.0226, cash: 0.0256, cpi:  0.0299 },
  { year: 1957, stocks: -0.1046, bonds:  0.0680, cash: 0.0323, cpi:  0.0290 },
  { year: 1958, stocks:  0.4372, bonds: -0.0210, cash: 0.0178, cpi:  0.0176 },
  { year: 1959, stocks:  0.1206, bonds: -0.0265, cash: 0.0326, cpi:  0.0173 },
  { year: 1960, stocks:  0.0034, bonds:  0.1164, cash: 0.0305, cpi:  0.0136 },
  { year: 1961, stocks:  0.2664, bonds:  0.0206, cash: 0.0227, cpi:  0.0067 },
  { year: 1962, stocks: -0.0881, bonds:  0.0569, cash: 0.0278, cpi:  0.0133 },
  { year: 1963, stocks:  0.2261, bonds:  0.0168, cash: 0.0311, cpi:  0.0164 },
  { year: 1964, stocks:  0.1642, bonds:  0.0373, cash: 0.0351, cpi:  0.0097 },
  { year: 1965, stocks:  0.1240, bonds:  0.0072, cash: 0.0390, cpi:  0.0192 },
  { year: 1966, stocks: -0.0997, bonds:  0.0291, cash: 0.0484, cpi:  0.0346 },
  { year: 1967, stocks:  0.2380, bonds: -0.0158, cash: 0.0433, cpi:  0.0304 },
  { year: 1968, stocks:  0.1081, bonds:  0.0327, cash: 0.0526, cpi:  0.0472 },
  { year: 1969, stocks: -0.0824, bonds: -0.0501, cash: 0.0656, cpi:  0.0620 },
  { year: 1970, stocks:  0.0356, bonds:  0.1675, cash: 0.0669, cpi:  0.0557 },
  { year: 1971, stocks:  0.1422, bonds:  0.0979, cash: 0.0454, cpi:  0.0327 },
  { year: 1972, stocks:  0.1876, bonds:  0.0282, cash: 0.0395, cpi:  0.0341 },
  { year: 1973, stocks: -0.1431, bonds:  0.0366, cash: 0.0673, cpi:  0.0871 },
  { year: 1974, stocks: -0.2590, bonds:  0.0199, cash: 0.0778, cpi:  0.1234 },
  { year: 1975, stocks:  0.3700, bonds:  0.0361, cash: 0.0599, cpi:  0.0694 },
  { year: 1976, stocks:  0.2383, bonds:  0.1598, cash: 0.0497, cpi:  0.0486 },
  { year: 1977, stocks: -0.0698, bonds:  0.0129, cash: 0.0513, cpi:  0.0670 },
  { year: 1978, stocks:  0.0651, bonds: -0.0078, cash: 0.0693, cpi:  0.0902 },
  { year: 1979, stocks:  0.1852, bonds:  0.0067, cash: 0.0994, cpi:  0.1329 },
  { year: 1980, stocks:  0.3174, bonds: -0.0299, cash: 0.1122, cpi:  0.1252 },
  { year: 1981, stocks: -0.0470, bonds:  0.0820, cash: 0.1430, cpi:  0.0892 },
  { year: 1982, stocks:  0.2042, bonds:  0.3281, cash: 0.1101, cpi:  0.0383 },
  { year: 1983, stocks:  0.2234, bonds:  0.0320, cash: 0.0845, cpi:  0.0379 },
  { year: 1984, stocks:  0.0615, bonds:  0.1373, cash: 0.0961, cpi:  0.0395 },
  { year: 1985, stocks:  0.3124, bonds:  0.2571, cash: 0.0749, cpi:  0.0380 },
  { year: 1986, stocks:  0.1849, bonds:  0.2428, cash: 0.0604, cpi:  0.0110 },
  { year: 1987, stocks:  0.0581, bonds: -0.0496, cash: 0.0572, cpi:  0.0443 },
  { year: 1988, stocks:  0.1654, bonds:  0.0822, cash: 0.0645, cpi:  0.0442 },
  { year: 1989, stocks:  0.3148, bonds:  0.1769, cash: 0.0811, cpi:  0.0465 },
  { year: 1990, stocks: -0.0306, bonds:  0.0624, cash: 0.0755, cpi:  0.0611 },
  { year: 1991, stocks:  0.3023, bonds:  0.1500, cash: 0.0561, cpi:  0.0306 },
  { year: 1992, stocks:  0.0749, bonds:  0.0936, cash: 0.0341, cpi:  0.0290 },
  { year: 1993, stocks:  0.0997, bonds:  0.1421, cash: 0.0298, cpi:  0.0275 },
  { year: 1994, stocks:  0.0133, bonds: -0.0804, cash: 0.0399, cpi:  0.0267 },
  { year: 1995, stocks:  0.3720, bonds:  0.2348, cash: 0.0552, cpi:  0.0254 },
  { year: 1996, stocks:  0.2268, bonds:  0.0143, cash: 0.0502, cpi:  0.0332 },
  { year: 1997, stocks:  0.3310, bonds:  0.0994, cash: 0.0505, cpi:  0.0170 },
  { year: 1998, stocks:  0.2834, bonds:  0.1492, cash: 0.0473, cpi:  0.0161 },
  { year: 1999, stocks:  0.2089, bonds: -0.0825, cash: 0.0451, cpi:  0.0268 },
  { year: 2000, stocks: -0.0903, bonds:  0.1666, cash: 0.0576, cpi:  0.0339 },
  { year: 2001, stocks: -0.1185, bonds:  0.0557, cash: 0.0367, cpi:  0.0155 },
  { year: 2002, stocks: -0.2197, bonds:  0.1512, cash: 0.0166, cpi:  0.0238 },
  { year: 2003, stocks:  0.2836, bonds:  0.0038, cash: 0.0103, cpi:  0.0188 },
  { year: 2004, stocks:  0.1074, bonds:  0.0449, cash: 0.0123, cpi:  0.0326 },
  { year: 2005, stocks:  0.0483, bonds:  0.0287, cash: 0.0301, cpi:  0.0342 },
  { year: 2006, stocks:  0.1561, bonds:  0.0196, cash: 0.0468, cpi:  0.0254 },
  { year: 2007, stocks:  0.0548, bonds:  0.1021, cash: 0.0464, cpi:  0.0408 },
  { year: 2008, stocks: -0.3655, bonds:  0.2010, cash: 0.0159, cpi:  0.0009 },
  { year: 2009, stocks:  0.2594, bonds: -0.1112, cash: 0.0014, cpi:  0.0272 },
  { year: 2010, stocks:  0.1482, bonds:  0.0846, cash: 0.0013, cpi:  0.0150 },
  { year: 2011, stocks:  0.0210, bonds:  0.1604, cash: 0.0003, cpi:  0.0296 },
  { year: 2012, stocks:  0.1589, bonds:  0.0297, cash: 0.0005, cpi:  0.0174 },
  { year: 2013, stocks:  0.3215, bonds: -0.0910, cash: 0.0007, cpi:  0.0150 },
  { year: 2014, stocks:  0.1352, bonds:  0.1075, cash: 0.0005, cpi:  0.0076 },
  { year: 2015, stocks:  0.0136, bonds:  0.0128, cash: 0.0021, cpi:  0.0073 },
  { year: 2016, stocks:  0.1174, bonds:  0.0069, cash: 0.0051, cpi:  0.0207 },
  { year: 2017, stocks:  0.2161, bonds:  0.0280, cash: 0.0139, cpi:  0.0211 },
  { year: 2018, stocks: -0.0423, bonds: -0.0002, cash: 0.0237, cpi:  0.0191 },
  { year: 2019, stocks:  0.3121, bonds:  0.0964, cash: 0.0155, cpi:  0.0229 },
  { year: 2020, stocks:  0.1802, bonds:  0.1133, cash: 0.0009, cpi:  0.0136 },
  { year: 2021, stocks:  0.2847, bonds: -0.0442, cash: 0.0005, cpi:  0.0704 },
  { year: 2022, stocks: -0.1804, bonds: -0.1783, cash: 0.0202, cpi:  0.0645 },
  { year: 2023, stocks:  0.2606, bonds:  0.0388, cash: 0.0507, cpi:  0.0335 },
  { year: 2024, stocks:  0.2490, bonds: -0.0134, cash: 0.0525, cpi:  0.0289 },
];

// ─── Simple historical withdrawal simulator (NO TAXES) ───────────────────
// This is the apples-to-apples model for Trinity Study comparison.
// Inputs:
//   startingBalance     — initial portfolio value
//   annualWithdrawal    — first-year withdrawal (inflation-adjusted thereafter)
//   stockPct, bondPct   — allocation (rebalanced annually), remainder is cash
//   years               — horizon in years
//   startYear           — first year of historical sequence (must allow windowed)
// Output:
//   { survived: boolean, endBalance: number }
function simulateHistorical(
  startingBalance: number,
  annualWithdrawal: number,
  stockPct: number,
  bondPct: number,
  years: number,
  startYear: number,
): { survived: boolean; endBalance: number } {
  const cashPct = Math.max(0, 1 - stockPct - bondPct);
  let balance = startingBalance;
  let cumInfl = 1.0;
  const startIdx = HISTORY.findIndex(r => r.year === startYear);
  if (startIdx < 0 || startIdx + years > HISTORY.length) {
    throw new Error(`Insufficient history for start year ${startYear}, ${years}y window`);
  }

  for (let y = 0; y < years; y++) {
    const row = HISTORY[startIdx + y];
    // Withdraw first (start-of-year withdrawal convention, matches Bengen)
    const wd = annualWithdrawal * cumInfl;
    balance -= wd;
    if (balance <= 0) return { survived: false, endBalance: 0 };
    // Apply weighted return
    const r = stockPct * row.stocks + bondPct * row.bonds + cashPct * row.cash;
    balance *= (1 + r);
    cumInfl *= (1 + row.cpi);
  }
  return { survived: balance > 0, endBalance: balance };
}

// Run backtest across all valid starting years, return success rate
function backtestRollingWindows(
  startingBalance: number,
  annualWithdrawal: number,
  stockPct: number,
  bondPct: number,
  years: number,
): { successRate: number; nWindows: number; worstYear: number; worstEnd: number; medianEnd: number } {
  const results: { year: number; survived: boolean; endBalance: number }[] = [];
  const lastStart = HISTORY[HISTORY.length - 1].year - years;
  for (let startYear = HISTORY[0].year; startYear <= lastStart; startYear++) {
    const r = simulateHistorical(startingBalance, annualWithdrawal, stockPct, bondPct, years, startYear);
    results.push({ year: startYear, ...r });
  }
  const successes = results.filter(r => r.survived).length;
  const successRate = successes / results.length;
  // Find worst sequence (lowest ending balance, with failures counted as 0)
  const sorted = [...results].sort((a, b) => a.endBalance - b.endBalance);
  const worst = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)].endBalance;
  return { successRate, nWindows: results.length, worstYear: worst.year, worstEnd: worst.endBalance, medianEnd: median };
}

// ─── Our Monte Carlo at same scenario (with taxes ON, default engine) ────
function ourMonteCarlo(
  startingBalance: number,
  monthlySpending: number,
  stockPct: number,
  bondPct: number,
  years: number,
  crashFreq: number,
): { successRate: number; p10End: number; p50End: number } {
  const s: ScenarioInput = scenario({
    currentAge: 65, retirementAge: 65, endAge: 65 + years,
    filingStatus: 'single',
    jobs: [], totalSavingsRate: 0,
    baseAnnualSpending: monthlySpending, // engine stores as monthly
    spendingInflationRate: 0.025,
    socialSecurityBenefit: 0, socialSecurityClaimAge: 99,
    pensionAmount: 0,
    otherIncomeSources: [],
    guardrails: OFF_GUARDRAILS,
    healthcare: OFF_HEALTHCARE,
    rothConversion: OFF_ROTH,
    cashBuffer: OFF_BUFFER,
    balances: { ...zeroBalances(), taxable: startingBalance },
    taxableCostBasisPct: 1.0,
    investments: {
      mode: 'simple',
      riskProfile: 'balanced',
      preRetirement: makeUniformAllocations(alloc(stockPct * 100, bondPct * 100)),
      postRetirement: makeUniformAllocations(alloc(stockPct * 100, bondPct * 100)),
      assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
      crashFrequency: crashFreq,
    },
  });
  const result = runSimulation(s, { numSimulations: 5000, seed: 12345 });
  const endings = [...result.endingBalances].sort((a, b) => a - b);
  return {
    successRate: result.successRate,
    p10End: endings[Math.floor(endings.length * 0.10)],
    p50End: endings[Math.floor(endings.length * 0.50)],
  };
}

// ─── Comparison runner ────────────────────────────────────────────────────
interface BacktestCase {
  name: string;
  startingBalance: number;
  annualWithdrawal: number;
  stockPct: number; // 0-1
  bondPct: number;  // 0-1
  years: number;
  // Published benchmark (Trinity Study / FIRECalc)
  publishedSuccess: string;
}

const CASES: BacktestCase[] = [
  { name: '4% Rule - 75/25 / 30y',  startingBalance: 1_000_000, annualWithdrawal: 40_000, stockPct: 0.75, bondPct: 0.25, years: 30, publishedSuccess: 'Trinity: 95%, FIRECalc: ~95%' },
  { name: '4% Rule - 50/50 / 30y',  startingBalance: 1_000_000, annualWithdrawal: 40_000, stockPct: 0.50, bondPct: 0.50, years: 30, publishedSuccess: 'Trinity: 90%' },
  { name: '4% Rule - 100/0 / 30y',  startingBalance: 1_000_000, annualWithdrawal: 40_000, stockPct: 1.00, bondPct: 0.00, years: 30, publishedSuccess: 'Trinity: 95%' },
  { name: '3% Rule - 60/40 / 30y',  startingBalance: 1_000_000, annualWithdrawal: 30_000, stockPct: 0.60, bondPct: 0.40, years: 30, publishedSuccess: 'Trinity: 100%' },
  { name: '5% Rule - 60/40 / 30y',  startingBalance: 1_000_000, annualWithdrawal: 50_000, stockPct: 0.60, bondPct: 0.40, years: 30, publishedSuccess: 'Trinity: 65%' },
  { name: '4% Rule - 75/25 / 40y',  startingBalance: 1_000_000, annualWithdrawal: 40_000, stockPct: 0.75, bondPct: 0.25, years: 40, publishedSuccess: 'cFIREsim ~85%' },
  { name: '3.5% Rule - 75/25 / 50y',startingBalance: 1_000_000, annualWithdrawal: 35_000, stockPct: 0.75, bondPct: 0.25, years: 50, publishedSuccess: 'cFIREsim ~85%' },
];

const NOTABLE_START_YEARS = [1929, 1937, 1966, 1969, 1973, 2000];

function fmtUSD(n: number) {
  if (n <= 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  HISTORICAL BACKTEST – Validating Monte Carlo against actual');
console.log('  1928-2024 sequences. Tax-free historical, taxed Monte Carlo.');
console.log(`  Crash frequency = ${DEFAULT_CRASH_FREQUENCY} (default / "historical")`);
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('─── PART 1: Notable historical retirement years (75/25, 4%, 30y) ──');
for (const startYear of NOTABLE_START_YEARS) {
  if (startYear + 30 > 2024) {
    console.log(`  ${startYear}: skipped (insufficient horizon)`);
    continue;
  }
  const r = simulateHistorical(1_000_000, 40_000, 0.75, 0.25, 30, startYear);
  console.log(`  ${startYear} retiree: ${r.survived ? 'SURVIVED' : 'DEPLETED'}  ending: ${fmtUSD(r.endBalance)}`);
}
console.log('');

console.log('─── PART 2: Trinity-Study comparison ──────────────────────────────');
console.log('Each row: HIST = rolling-window historical (NO taxes, NO RMDs, NO healthcare)');
console.log('          MC   = our Monte Carlo (WITH taxes, RMDs, etc.)\n');
console.log('Scenario                               │ HIST    │ MC      │ Δ      │ Published');
console.log('───────────────────────────────────────┼─────────┼─────────┼────────┼──────────────');

for (const c of CASES) {
  const hist = backtestRollingWindows(c.startingBalance, c.annualWithdrawal, c.stockPct, c.bondPct, c.years);
  const mc = ourMonteCarlo(c.startingBalance, c.annualWithdrawal / 12, c.stockPct, c.bondPct, c.years, DEFAULT_CRASH_FREQUENCY);
  const delta = (mc.successRate - hist.successRate) * 100;
  const name = c.name.padEnd(38);
  const histPct = `${(hist.successRate * 100).toFixed(1)}%`.padStart(7);
  const mcPct = `${(mc.successRate * 100).toFixed(1)}%`.padStart(7);
  const deltaStr = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`.padStart(6);
  console.log(`${name} │ ${histPct} │ ${mcPct} │ ${deltaStr} │ ${c.publishedSuccess}`);
}

console.log('\n─── PART 3: Worst-case calibration (4% / 75-25 / 30y) ─────────────');
const worstHist = backtestRollingWindows(1_000_000, 40_000, 0.75, 0.25, 30);
const worstMC = ourMonteCarlo(1_000_000, 40_000 / 12, 0.75, 0.25, 30, DEFAULT_CRASH_FREQUENCY);
console.log(`  Historical worst start year:    ${worstHist.worstYear}`);
console.log(`  Historical worst ending bal:    ${fmtUSD(worstHist.worstEnd)}`);
console.log(`  Historical median ending bal:   ${fmtUSD(worstHist.medianEnd)}`);
console.log(`  Our Monte Carlo P10 ending:     ${fmtUSD(worstMC.p10End)}  (tax-included)`);
console.log(`  Our Monte Carlo P50 ending:     ${fmtUSD(worstMC.p50End)}  (tax-included)`);

console.log('\n─── INTERPRETATION ────────────────────────────────────────────────');
console.log('• HIST should match Trinity/FIRECalc closely (validates our data).');
console.log('• MC < HIST is EXPECTED: our engine includes taxes, healthcare, RMDs.');
console.log('  Typical gap: 3-8pp for taxable-account scenarios.');
console.log('• MC P10 should be roughly as bad as HIST worst-case sequence — if much');
console.log('  worse, the regime model is too pessimistic in the tail.');
console.log('═══════════════════════════════════════════════════════════════');
