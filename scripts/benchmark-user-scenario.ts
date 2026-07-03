/**
 * Ad-hoc benchmark for a specific user scenario against external calculators.
 *
 * The idea: this app's engine has many features other calculators lack
 * (multi-account, taxes, sequence-aware crash regimes, etc.). When our
 * success rate looks low, we want to check that the low number is honest
 * — not the byproduct of one over-conservative assumption.
 *
 * For the user's scenario we:
 *   1. Run our engine as-is (source of truth we're checking).
 *   2. Extract the median expected portfolio balance at retirement.
 *   3. Build the age-varying real-dollar draw schedule the portfolio has
 *      to cover after subtracting guaranteed income (pension, SS).
 *   4. Feed that schedule to two textbook engines:
 *        a) Bengen historical rolling-window (real returns, 1926+ data)
 *        b) Textbook Gaussian Monte Carlo (constant mean/vol, no regimes)
 *   5. Print a side-by-side.
 *
 * If our number is much lower than both textbook methods, we're probably
 * being overly pessimistic. If all three agree, the low number is real.
 *
 * Usage:  npx tsx scripts/benchmark-user-scenario.ts
 */

import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../src/constants/defaults';
import type { ScenarioInput } from '../src/types';
import { loadHistoricalReturns } from './external-benchmarks/historical-data';
import { PRNG } from '../src/engine/math';

// ── Load the scenario ──────────────────────────────────────────────────
const SCENARIO_PATH = '/Users/mm39036/Downloads/11kAt55 (2).json';
const raw = JSON.parse(readFileSync(SCENARIO_PATH, 'utf-8'));
const scenario: ScenarioInput = { ...DEFAULT_SCENARIO, ...raw };

const N_SIMS = 5000;
const SEED = 42;

// ── Basic scenario facts (annualised) ──────────────────────────────────
const retirementAge = scenario.retirementAge;
const endAge = scenario.endAge;
const years = endAge - retirementAge;
const annualSpending = scenario.baseAnnualSpending * 12;
const annualPension = scenario.pensionAmount * 12; // no COLA
const pensionStartAge = scenario.pensionStartAge;
const inflation = scenario.spendingInflationRate; // for pension real-decay

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(` USER SCENARIO BENCHMARK — "${scenario.name}"`);
console.log('══════════════════════════════════════════════════════════════════');
console.log(` Retirement: age ${retirementAge} → ${endAge}  (${years} years)`);
console.log(` Annual spending (real): $${annualSpending.toLocaleString()}`);
console.log(` Annual pension (nominal, starts age ${pensionStartAge}): $${annualPension.toLocaleString()}`);
console.log(` Spending inflation: ${(inflation * 100).toFixed(2)}%`);

// ── 1. Run our engine as-is ────────────────────────────────────────────
console.log('\n── 1. This app (full-featured engine) ──');
const ours = runSimulation(scenario, { numSimulations: N_SIMS, seed: SEED });
console.log(`   Success rate: ${(ours.successRate * 100).toFixed(1)}%`);

// Extract median portfolio at key ages
const medianAt = (age: number): number => {
  const y = ours.medianPath.find(r => r.age === age);
  return y ? y.totalBalance : 0;
};
const ssAt = (age: number): number => {
  const y = ours.medianPath.find(r => r.age === age);
  return y ? (y.income.socialSecurity + y.income.pension) : 0;
};
console.log('   Median expected balance:');
for (const age of [retirementAge, 60, 62, 65, 70, 80]) {
  if (age > endAge) break;
  console.log(`     Age ${age}: $${(medianAt(age) / 1000).toFixed(0)}K` +
    `   (guaranteed income: $${(ssAt(age) / 1000).toFixed(1)}K/yr)`);
}

// ── 2. Build the age-varying real-dollar draw schedule ─────────────────
// Textbook calculators can only handle a schedule of real portfolio draws.
// So we compute: "for each retirement year, what real-dollar draw does the
// portfolio need to cover, after guaranteed income?"
//
// Guaranteed income model:
//   pension  = $58,800/yr nominal (no COLA) → decays in real terms
//   SS       = primary + spousal, both at 62, with COLA → constant in real terms
//
// SS number: read from our engine's median path (already includes COLA modeling
// and spousal add-on), and convert to a real-dollar constant. We use the value
// at age 63 (first full year both are claiming) and treat it as real.

const guaranteedRealAt = (age: number): number => {
  if (age < pensionStartAge) return 0;
  // Real pension: nominal / (1 + infl)^(years since retirement start)
  const yearsSincePensionStart = age - pensionStartAge;
  const pensionReal = annualPension / Math.pow(1 + inflation, yearsSincePensionStart);
  // Real SS: use our engine's estimate at age 63 and hold constant in real terms.
  const ssStartAge = 63;
  if (age < ssStartAge) {
    // Primary claimed at 62 but partial year — use engine's value directly.
    const ssNominal = ssAt(age) - annualPension; // strip pension from combined figure
    const yearsFromRet = age - retirementAge;
    return pensionReal + Math.max(0, ssNominal / Math.pow(1 + inflation, yearsFromRet));
  }
  const ssRefNominal = ssAt(ssStartAge) - annualPension;
  const yearsRefFromRet = ssStartAge - retirementAge;
  const ssReal = Math.max(0, ssRefNominal / Math.pow(1 + inflation, yearsRefFromRet));
  return pensionReal + ssReal;
};

const spendingSchedule: number[] = [];
for (let k = 0; k < years; k++) {
  const age = retirementAge + k;
  const gross = annualSpending;                    // real, constant
  const guar = guaranteedRealAt(age);              // real
  spendingSchedule.push(Math.max(0, gross - guar));
}

console.log('\n── 2. Effective real-dollar portfolio draw schedule ──');
console.log('   (this is what the portfolio must fund after pension + SS)');
for (const k of [0, 4, 6, 7, 10, 15, 25, years - 1]) {
  if (k >= years) continue;
  const age = retirementAge + k;
  console.log(`     Year ${k.toString().padStart(2)} (age ${age}): $${(spendingSchedule[k] / 1000).toFixed(1)}K real`);
}

// ── 3. Bengen historical rolling-window with age-varying spending ──────
const START_BALANCE = medianAt(retirementAge);
const STOCK_PCT = 0.60; // matches post-retirement allocation (60/30/10 → 60% stocks)
const BOND_PCT = 0.40;  // fold cash into bonds for Bengen (bengen has no cash class)

console.log(`\n── 3. Bengen historical rolling-window (real returns) ──`);
console.log(`   Start balance: $${(START_BALANCE / 1000).toFixed(0)}K (= median at age ${retirementAge} from our engine)`);
console.log(`   Allocation: ${STOCK_PCT * 100}% stocks / ${BOND_PCT * 100}% bonds`);
console.log(`   Horizon: ${years} years`);

const hist = loadHistoricalReturns();
let windows = 0;
let failures = 0;
const endingBalances: number[] = [];
for (let start = 0; start + years <= hist.years.length; start++) {
  let bal = START_BALANCE;
  let failed = false;
  for (let k = 0; k < years; k++) {
    bal -= spendingSchedule[k]; // real spending
    if (bal <= 0) { failed = true; bal = 0; break; }
    const r = STOCK_PCT * hist.stocks[start + k] + BOND_PCT * hist.bonds[start + k];
    bal *= (1 + r);
  }
  windows++;
  if (failed) failures++;
  endingBalances.push(bal);
}
const bengenSuccess = 1 - failures / windows;
endingBalances.sort((a, b) => a - b);
const bengenMedian = endingBalances[Math.floor(endingBalances.length / 2)];
const bengenP10 = endingBalances[Math.floor(endingBalances.length * 0.10)];
console.log(`   Success rate: ${(bengenSuccess * 100).toFixed(1)}%  (${windows - failures}/${windows} windows)`);
console.log(`   Median ending: $${(bengenMedian / 1000).toFixed(0)}K real`);
console.log(`   P10 ending:    $${(bengenP10 / 1000).toFixed(0)}K real`);

// ── 4. Textbook Gaussian Monte Carlo (no regimes, no crashes) ──────────
console.log(`\n── 4. Textbook Gaussian Monte Carlo (constant mean/vol, no crash regime) ──`);
const returns = scenario.investments.assetClassReturns;
const stockMean = returns.stocks.mean;
const stockStd = returns.stocks.stdDev;
const bondMean = returns.bonds.mean;
const bondStd = returns.bonds.stdDev;
console.log(`   Stocks: N(${(stockMean * 100).toFixed(1)}%, σ=${(stockStd * 100).toFixed(1)}%)`);
console.log(`   Bonds:  N(${(bondMean * 100).toFixed(1)}%, σ=${(bondStd * 100).toFixed(1)}%)`);
console.log(`   Correlation: 0 (independent). No crash regime.`);
console.log(`   Note: these returns are NOMINAL; we deflate by ${(inflation * 100).toFixed(1)}% inflation to compare real-dollar spending.`);

const rng = new PRNG(SEED);
const mcN = 10000;
let mcFail = 0;
const mcEnd: number[] = [];
for (let sim = 0; sim < mcN; sim++) {
  let bal = START_BALANCE;
  let failed = false;
  for (let k = 0; k < years; k++) {
    bal -= spendingSchedule[k]; // real draw
    if (bal <= 0) { failed = true; bal = 0; break; }
    const zS = rng.nextGaussian();
    const zB = rng.nextGaussian();
    const rStockNom = stockMean + stockStd * zS;
    const rBondNom = bondMean + bondStd * zB;
    const rNom = STOCK_PCT * rStockNom + BOND_PCT * rBondNom;
    const rReal = (1 + rNom) / (1 + inflation) - 1;
    bal *= (1 + rReal);
  }
  if (failed) mcFail++;
  mcEnd.push(bal);
}
const mcSuccess = 1 - mcFail / mcN;
mcEnd.sort((a, b) => a - b);
const mcMedian = mcEnd[Math.floor(mcN / 2)];
const mcP10 = mcEnd[Math.floor(mcN * 0.10)];
console.log(`   Success rate: ${(mcSuccess * 100).toFixed(1)}%  (${mcN} sims)`);
console.log(`   Median ending: $${(mcMedian / 1000).toFixed(0)}K real`);
console.log(`   P10 ending:    $${(mcP10 / 1000).toFixed(0)}K real`);

// ── 5. Reference: what WR (constant real, from age 55) gives 100% Bengen? ──
console.log(`\n── 5. Reference: SAFEMAX for ${years}yr / 60-40 ──`);
function bengenSuccessAt(constantRealSpending: number): number {
  let f = 0, w = 0;
  for (let start = 0; start + years <= hist.years.length; start++) {
    let bal = START_BALANCE;
    let failed = false;
    for (let k = 0; k < years; k++) {
      bal -= constantRealSpending;
      if (bal <= 0) { failed = true; break; }
      const r = STOCK_PCT * hist.stocks[start + k] + BOND_PCT * hist.bonds[start + k];
      bal *= (1 + r);
    }
    w++;
    if (failed) f++;
  }
  return 1 - f / w;
}
let lo = 0.005, hi = 0.10;
for (let i = 0; i < 30; i++) {
  const mid = (lo + hi) / 2;
  if (bengenSuccessAt(START_BALANCE * mid) === 1) lo = mid;
  else hi = mid;
}
const safemaxRate = lo;
console.log(`   SAFEMAX (100% historical): ${(safemaxRate * 100).toFixed(2)}% initial WR`);
console.log(`     → $${((START_BALANCE * safemaxRate) / 1000).toFixed(0)}K/yr constant real spending`);

// Compute effective initial WR of user scenario
const yr0Draw = spendingSchedule[0];
const iwr = yr0Draw / START_BALANCE;
console.log(`   User scenario yr-1 portfolio draw: $${(yr0Draw / 1000).toFixed(0)}K = ${(iwr * 100).toFixed(2)}% IWR`);

// ── Final summary ──────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════════════`);
console.log(` SUMMARY — success rates for same $${(START_BALANCE / 1000).toFixed(0)}K start, same draw schedule:`);
console.log(`══════════════════════════════════════════════════════════════════`);
console.log(`   This app (full features):        ${(ours.successRate * 100).toFixed(1)}%`);
console.log(`   Bengen historical rolling:       ${(bengenSuccess * 100).toFixed(1)}%`);
console.log(`   Textbook Gaussian Monte Carlo:   ${(mcSuccess * 100).toFixed(1)}%`);
console.log('');
console.log(`   Notes:`);
console.log(`     • Textbook engines omit taxes, cash drag, regime switches, spousal income timing subtleties.`);
console.log(`     • Bengen uses real 1926–${hist.years[hist.years.length - 1]} S&P + intermediate Treasury returns.`);
console.log(`     • Our engine models pre-retirement contributions & growth from age ${scenario.currentAge}→${retirementAge}`);
console.log(`       so the retirement-start balance is itself stochastic (not fixed at $${(START_BALANCE / 1000).toFixed(0)}K).`);
console.log(`══════════════════════════════════════════════════════════════════\n`);
