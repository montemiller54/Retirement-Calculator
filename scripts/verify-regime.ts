/**
 * Verify the Markov regime-switching model behaves correctly.
 * Checks: bear frequency, clustering, crash magnitudes, bond isolation, success rate sensitivity.
 */
import { PRNG, cholesky, generateCorrelatedReturns, crashFrequencyToSteadyState } from '../src/engine/math';
import { DEFAULT_CORRELATION_MATRIX, DEFAULT_ASSET_RETURNS, BULL_REGIME, BEAR_REGIME, BEAR_PERSISTENCE } from '../src/constants/asset-classes';
import { ASSET_CLASSES } from '../src/types';
import { runSimulation } from '../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../src/constants/defaults';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0, failed = 0;

function check(label: string, condition: boolean, detail: string) {
  if (condition) { console.log(`  ${PASS} ${label}: ${detail}`); passed++; }
  else { console.log(`  ${FAIL} ${label}: ${detail}`); failed++; }
}

// ══════════════════════════════════════════════════════════
// 1. Bear frequency matches slider mapping
// ══════════════════════════════════════════════════════════
console.log('\n═══ 1. Bear Frequency vs Slider ═══');
for (const cf of [1, 3, 5.5, 8, 10]) {
  const ss = crashFrequencyToSteadyState(cf);
  const enterBear = ss * (1 - BEAR_PERSISTENCE) / (1 - ss);

  const rng = new PRNG(42);
  const N = 100000;
  let bearYears = 0;
  let inBear = rng.next() < ss;
  for (let i = 0; i < N; i++) {
    if (inBear) bearYears++;
    inBear = inBear ? rng.next() < BEAR_PERSISTENCE : rng.next() < enterBear;
  }
  const actual = bearYears / N;
  const diff = Math.abs(actual - ss);
  check(
    `cf=${cf}`,
    diff < 0.01,
    `target=${(ss * 100).toFixed(1)}%, actual=${(actual * 100).toFixed(1)}%`
  );
}

// ══════════════════════════════════════════════════════════
// 2. Bear market clustering (consecutive bear years)
// ══════════════════════════════════════════════════════════
console.log('\n═══ 2. Bear Market Clustering ═══');
{
  const ss = crashFrequencyToSteadyState(5.5); // default
  const enterBear = ss * (1 - BEAR_PERSISTENCE) / (1 - ss);
  const rng = new PRNG(123);
  const N = 200000;
  let inBear = rng.next() < ss;
  const streaks: number[] = [];
  let currentStreak = inBear ? 1 : 0;

  for (let i = 1; i < N; i++) {
    inBear = inBear ? rng.next() < BEAR_PERSISTENCE : rng.next() < enterBear;
    if (inBear) {
      currentStreak++;
    } else if (currentStreak > 0) {
      streaks.push(currentStreak);
      currentStreak = 0;
    }
  }
  if (currentStreak > 0) streaks.push(currentStreak);

  const avgStreak = streaks.reduce((a, b) => a + b, 0) / streaks.length;
  const maxStreak = Math.max(...streaks);
  const expectedAvg = 1 / (1 - BEAR_PERSISTENCE); // ≈ 2.22

  check('avg bear streak', Math.abs(avgStreak - expectedAvg) < 0.2,
    `expected ~${expectedAvg.toFixed(2)}, actual=${avgStreak.toFixed(2)}`);
  check('max streak exists', maxStreak >= 4,
    `longest bear streak = ${maxStreak} years (should see 4+ occasionally)`);
  check('multi-year bears', streaks.filter(s => s >= 2).length > streaks.length * 0.3,
    `${(streaks.filter(s => s >= 2).length / streaks.length * 100).toFixed(0)}% of bear episodes last 2+ years`);
}

// ══════════════════════════════════════════════════════════
// 3. Return distributions by regime
// ══════════════════════════════════════════════════════════
console.log('\n═══ 3. Return Distributions ═══');
{
  const rng = new PRNG(999);
  const L = cholesky(DEFAULT_CORRELATION_MATRIX);
  const means = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].mean);
  const stdDevs = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].stdDev);
  const mask = [true, false, false, true]; // stocks, crypto only
  const N = 50000;

  const bullStocks: number[] = [], bearStocks: number[] = [];
  const bullBonds: number[] = [], bearBonds: number[] = [];

  for (let i = 0; i < N; i++) {
    const bull = generateCorrelatedReturns(rng, L, means, stdDevs, false, mask);
    const bear = generateCorrelatedReturns(rng, L, means, stdDevs, true, mask);
    bullStocks.push(bull[0]);
    bearStocks.push(bear[0]);
    bullBonds.push(bull[1]);
    bearBonds.push(bear[1]);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[]) => {
    const m = avg(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
  };

  const bullMean = avg(bullStocks), bearMean = avg(bearStocks);
  const bullVol = std(bullStocks), bearVol = std(bearStocks);

  check('bull stock mean', Math.abs(bullMean - BULL_REGIME.mean) < 0.015,
    `expected ~${(BULL_REGIME.mean * 100).toFixed(1)}%, actual=${(bullMean * 100).toFixed(1)}%`);
  check('bear stock mean', Math.abs(bearMean - BEAR_REGIME.mean) < 0.015,
    `expected ~${(BEAR_REGIME.mean * 100).toFixed(1)}%, actual=${(bearMean * 100).toFixed(1)}%`);
  check('bull stock vol', Math.abs(bullVol - BULL_REGIME.vol) < 0.015,
    `expected ~${(BULL_REGIME.vol * 100).toFixed(0)}%, actual=${(bullVol * 100).toFixed(1)}%`);
  check('bear stock vol', Math.abs(bearVol - BEAR_REGIME.vol) < 0.015,
    `expected ~${(BEAR_REGIME.vol * 100).toFixed(0)}%, actual=${(bearVol * 100).toFixed(1)}%`);

  // Bonds should be identical in both regimes
  const bullBondMean = avg(bullBonds), bearBondMean = avg(bearBonds);
  check('bonds unaffected', Math.abs(bullBondMean - bearBondMean) < 0.005,
    `bull bonds=${(bullBondMean * 100).toFixed(2)}%, bear bonds=${(bearBondMean * 100).toFixed(2)}%`);
}

// ══════════════════════════════════════════════════════════
// 4. No impossible returns (> -100%)
// ══════════════════════════════════════════════════════════
console.log('\n═══ 4. No Impossible Returns ═══');
{
  const rng = new PRNG(777);
  const L = cholesky(DEFAULT_CORRELATION_MATRIX);
  const means = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].mean);
  const stdDevs = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].stdDev);
  const mask = [true, false, false, true];
  const N = 200000;
  let minReturn = Infinity;
  let belowMinus100 = 0;

  for (let i = 0; i < N; i++) {
    const isBear = i % 5 === 0; // oversample bear
    const r = generateCorrelatedReturns(rng, L, means, stdDevs, isBear, mask);
    for (const v of r) {
      if (v < minReturn) minReturn = v;
      if (v < -1.0) belowMinus100++;
    }
  }
  check('no returns below -100%', belowMinus100 === 0,
    `violations=${belowMinus100}, min return=${(minReturn * 100).toFixed(1)}%`);
  check('min return is reasonable', minReturn >= -1.0,
    `min return = ${(minReturn * 100).toFixed(1)}% (clamped at -100%, no impossible values)`);
}

// ══════════════════════════════════════════════════════════
// 5. Crash frequency calibration at default (5.5)
// ══════════════════════════════════════════════════════════
console.log('\n═══ 5. Crash Frequency Calibration (cf=5.5) ═══');
{
  const ss = crashFrequencyToSteadyState(5.5);
  const enterBear = ss * (1 - BEAR_PERSISTENCE) / (1 - ss);
  const rng = new PRNG(42);
  const L = cholesky(DEFAULT_CORRELATION_MATRIX);
  const means = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].mean);
  const stdDevs = ASSET_CLASSES.map(ac => DEFAULT_ASSET_RETURNS[ac].stdDev);
  const mask = [true, false, false, true];

  const N = 500000;
  let inBear = rng.next() < ss;
  const thresholds = [-0.20, -0.30, -0.40, -0.50];
  const counts = [0, 0, 0, 0];

  for (let i = 0; i < N; i++) {
    if (i > 0) {
      inBear = inBear ? rng.next() < BEAR_PERSISTENCE : rng.next() < enterBear;
    }
    const r = generateCorrelatedReturns(rng, L, means, stdDevs, inBear, mask);
    const stockReturn = r[0];
    for (let t = 0; t < thresholds.length; t++) {
      if (stockReturn <= thresholds[t]) counts[t]++;
    }
  }

  const targets = [
    { thresh: -20, hist: '1-in-8', target: 8, lo: 6, hi: 15 },
    { thresh: -30, hist: '1-in-20', target: 20, lo: 14, hi: 30 },
    { thresh: -40, hist: '1-in-50', target: 50, lo: 30, hi: 80 },
    { thresh: -50, hist: '1-in-100', target: 100, lo: 60, hi: 200 },
  ];

  for (let t = 0; t < targets.length; t++) {
    const freq = counts[t] > 0 ? N / counts[t] : Infinity;
    check(
      `≤${targets[t].thresh}%`,
      freq >= targets[t].lo && freq <= targets[t].hi,
      `1-in-${freq.toFixed(0)}y (historical ${targets[t].hist}, range ${targets[t].lo}-${targets[t].hi})`
    );
  }
}

// ══════════════════════════════════════════════════════════
// 6. Simulation success rates respond to crash frequency
// ══════════════════════════════════════════════════════════
console.log('\n═══ 6. Simulation Success Rate Sensitivity ═══');
{
  const rates: { cf: number; rate: number }[] = [];
  for (const cf of [1, 5.5, 10]) {
    const scenario = {
      ...DEFAULT_SCENARIO,
      investments: {
        ...DEFAULT_SCENARIO.investments,
        crashFrequency: cf,
      },
    };
    const result = runSimulation(scenario, { numSimulations: 500, seed: 42 });
    rates.push({ cf, rate: result.successRate });
    console.log(`  cf=${cf}: success=${(result.successRate * 100).toFixed(1)}%`);
  }

  check('low crash > default', rates[0].rate > rates[1].rate,
    `cf=1: ${(rates[0].rate * 100).toFixed(1)}% > cf=5.5: ${(rates[1].rate * 100).toFixed(1)}%`);
  check('default > high crash', rates[1].rate > rates[2].rate,
    `cf=5.5: ${(rates[1].rate * 100).toFixed(1)}% > cf=10: ${(rates[2].rate * 100).toFixed(1)}%`);
  check('meaningful spread', rates[0].rate - rates[2].rate > 0.05,
    `spread = ${((rates[0].rate - rates[2].rate) * 100).toFixed(1)}pp`);
}

// ══════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
if (failed === 0) {
  console.log('\x1b[32m\nAll regime-switching model checks passed!\x1b[0m\n');
} else {
  console.log('\x1b[31m\nSome checks failed — see above.\x1b[0m\n');
  process.exit(1);
}
