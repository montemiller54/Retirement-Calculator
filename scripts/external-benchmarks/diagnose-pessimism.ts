/**
 * Diagnostic: why is our Monte Carlo more pessimistic than historical
 * backtests on the same scenarios?
 *
 * Investigates four hypotheses:
 *   H1. Our nominal expected returns are lower than historical real returns
 *       once inflation is applied.
 *   H2. Our return distribution has fatter / worse left tail than history.
 *   H3. The Bengen comparison is biased high because Shiller starts in 1872
 *       (pre-1928 had unusually good real returns); restricting to 1928+ closes
 *       part of the gap.
 *   H4. Regime-switching is the dominant cause; reducing crash frequency to
 *       its lowest setting closes most of the gap.
 *
 * Outputs a markdown report with findings and a verdict per hypothesis.
 *
 * Usage:  npx tsx scripts/external-benchmarks/diagnose-pessimism.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHistoricalReturns } from './historical-data';
import { runBengen } from './bengen-engine';
import { runOurEngine } from './our-engine-adapter';
import type { ExternalScenario } from './scenarios';
import { CANONICAL_SCENARIOS } from './scenarios';
import { PRNG, generateCorrelatedReturns, cholesky, crashFrequencyToSteadyState } from '../../src/engine/math';
import { runSimulation } from '../../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../../src/constants/defaults';
import { makeUniformAllocations } from '../../src/constants/asset-classes';
import type { ScenarioInput } from '../../src/types';
import {
  DEFAULT_CORRELATION_MATRIX, BEAR_CORRELATION_MATRIX, DEFAULT_ASSET_RETURNS,
  BEAR_PERSISTENCE, BEAR_BOND_MEAN,
  POST_BEAR_RECOVERY_YEAR1_MEAN, POST_BEAR_RECOVERY_YEAR2_MEAN,
  DEFAULT_CRASH_FREQUENCY, MAX_BEAR_DURATION,
} from '../../src/constants/asset-classes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_FILE = join(REPO_ROOT, 'benchmarks', 'pessimism-diagnosis.md');

const NUM_SAMPLES = 5000;          // MC paths to sample for distribution stats
const ASSUMED_INFLATION = 0.025;   // long-run inflation we subtract to convert nominal → real

interface DistStats {
  label: string;
  meanRealReturn: number;
  stdRealReturn: number;
  cagr30Median: number;
  cagr30P10: number;
  cagr30Worst: number;
  worst10yrCagr: number; // worst rolling 10-year real CAGR within any 30-year sequence
  pctYearsNegative: number;
}

// ──────────────────────────────────────────────────────────────────────
// Helper: sample a single 30-year sequence of stock real returns from
// our engine's regime-switching model. Mirrors runSinglePath's regime
// state machine exactly, but only for the stocks asset class.
// ──────────────────────────────────────────────────────────────────────
function sampleEngineReturnSequence(
  rng: PRNG,
  bullCholeskyL: number[][],
  bearCholeskyL: number[][],
  years: number,
  crashFrequency: number,
  stockPct: number,
  bondPct: number,
  inflation: number,
): number[] {
  const means = [
    DEFAULT_ASSET_RETURNS.stocks.mean,
    DEFAULT_ASSET_RETURNS.bonds.mean,
    DEFAULT_ASSET_RETURNS.cash.mean,
    DEFAULT_ASSET_RETURNS.crypto.mean,
  ];
  const stdDevs = [
    DEFAULT_ASSET_RETURNS.stocks.stdDev,
    DEFAULT_ASSET_RETURNS.bonds.stdDev,
    DEFAULT_ASSET_RETURNS.cash.stdDev,
    DEFAULT_ASSET_RETURNS.crypto.stdDev,
  ];
  const bearMeans = [...means];
  bearMeans[1] = BEAR_BOND_MEAN;
  const regimeMask = [true, false, false, true]; // stocks, crypto

  const bearSteadyState = crashFrequencyToSteadyState(crashFrequency);
  const enterBear = bearSteadyState * (1 - BEAR_PERSISTENCE) / (1 - bearSteadyState);
  let inBear = rng.next() < bearSteadyState;
  let bearDuration = inBear ? 1 : 0;
  let recoveryYearsRemaining = 0;
  let lastBearDuration = 0;

  const realReturns: number[] = [];
  for (let y = 0; y < years; y++) {
    if (y > 0) {
      const wasBear = inBear;
      inBear = inBear
        ? (bearDuration < MAX_BEAR_DURATION && rng.next() < BEAR_PERSISTENCE)
        : rng.next() < enterBear;
      if (wasBear && !inBear) {
        lastBearDuration = bearDuration;
        recoveryYearsRemaining = bearDuration >= 2 ? 2 : 1;
        bearDuration = 0;
      } else if (inBear) {
        bearDuration++;
        recoveryYearsRemaining = 0;
      } else if (recoveryYearsRemaining > 0) {
        recoveryYearsRemaining--;
      }
    }
    const choleskyL = inBear ? bearCholeskyL : bullCholeskyL;
    const yearMeans = inBear ? bearMeans : means;
    let recoveryBoost: number | undefined;
    if (!inBear && recoveryYearsRemaining > 0) {
      const isFirst = (lastBearDuration >= 2 && recoveryYearsRemaining === 2) ||
                      (lastBearDuration === 1 && recoveryYearsRemaining === 1);
      const baseMean = isFirst ? POST_BEAR_RECOVERY_YEAR1_MEAN : POST_BEAR_RECOVERY_YEAR2_MEAN;
      const scale = Math.min(1, 0.5 + 0.25 * lastBearDuration);
      recoveryBoost = baseMean * scale;
    }
    const r = generateCorrelatedReturns(rng, choleskyL, yearMeans, stdDevs, inBear, regimeMask, recoveryBoost);
    const nominalBlended = stockPct * r[0] + bondPct * r[1];
    const realBlended = (1 + nominalBlended) / (1 + inflation) - 1;
    realReturns.push(realBlended);
  }
  return realReturns;
}

function computeStats(
  label: string,
  sequences: number[][],
): DistStats {
  const allReturns = sequences.flat();
  const n = allReturns.length;
  const mean = allReturns.reduce((a, b) => a + b, 0) / n;
  const variance = allReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const negCount = allReturns.filter(r => r < 0).length;

  const cagr30s: number[] = [];
  const worst10s: number[] = [];
  for (const seq of sequences) {
    const compound30 = seq.reduce((acc, r) => acc * (1 + r), 1);
    const cagr30 = Math.pow(compound30, 1 / seq.length) - 1;
    cagr30s.push(cagr30);

    // Worst rolling 10-year real CAGR inside this 30-year sequence
    let worst10 = Infinity;
    for (let i = 0; i + 10 <= seq.length; i++) {
      const window = seq.slice(i, i + 10);
      const compound = window.reduce((acc, r) => acc * (1 + r), 1);
      const cagr = Math.pow(compound, 1 / 10) - 1;
      if (cagr < worst10) worst10 = cagr;
    }
    worst10s.push(worst10);
  }

  cagr30s.sort((a, b) => a - b);
  worst10s.sort((a, b) => a - b);

  return {
    label,
    meanRealReturn: mean,
    stdRealReturn: std,
    cagr30Median: cagr30s[Math.floor(cagr30s.length / 2)],
    cagr30P10: cagr30s[Math.floor(cagr30s.length * 0.10)],
    cagr30Worst: cagr30s[0],
    worst10yrCagr: worst10s[0],
    pctYearsNegative: negCount / n,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Sample many 30-year sequences from MC engine
// ──────────────────────────────────────────────────────────────────────
function sampleEngineSequences(
  numSamples: number,
  years: number,
  stockPct: number,
  bondPct: number,
  crashFrequency: number,
): number[][] {
  const bullCholeskyL = cholesky(DEFAULT_CORRELATION_MATRIX);
  const bearCholeskyL = cholesky(BEAR_CORRELATION_MATRIX);
  const rng = new PRNG(20260610);
  const sequences: number[][] = [];
  for (let i = 0; i < numSamples; i++) {
    sequences.push(sampleEngineReturnSequence(
      rng, bullCholeskyL, bearCholeskyL, years, crashFrequency,
      stockPct, bondPct, ASSUMED_INFLATION,
    ));
  }
  return sequences;
}

// ──────────────────────────────────────────────────────────────────────
// Sample 30-year rolling windows from history
// ──────────────────────────────────────────────────────────────────────
function sampleHistoricalSequences(
  years: number,
  stockPct: number,
  bondPct: number,
  yearFloor?: number,
): number[][] {
  const hist = loadHistoricalReturns();
  const sequences: number[][] = [];
  for (let start = 0; start + years <= hist.years.length; start++) {
    if (yearFloor && hist.years[start] < yearFloor) continue;
    const seq: number[] = [];
    for (let k = 0; k < years; k++) {
      seq.push(stockPct * hist.stocks[start + k] + bondPct * hist.bonds[start + k]);
    }
    sequences.push(seq);
  }
  return sequences;
}

// ──────────────────────────────────────────────────────────────────────
// Bengen restricted to 1928+ (Pfau / Bengen modern dataset)
// ──────────────────────────────────────────────────────────────────────
function runBengenRestricted(scenario: ExternalScenario, yearFloor: number) {
  const hist = loadHistoricalReturns();
  const startIdx = hist.years.findIndex(y => y >= yearFloor);
  let failures = 0;
  let total = 0;
  const endingBalances: number[] = [];
  for (let start = startIdx; start + scenario.years <= hist.years.length; start++) {
    let balance = scenario.initialBalance;
    for (let k = 0; k < scenario.years; k++) {
      balance -= scenario.annualSpending;
      if (balance <= 0) { balance = 0; break; }
      const r = scenario.stockPct * hist.stocks[start + k] + scenario.bondPct * hist.bonds[start + k];
      balance *= 1 + r;
    }
    endingBalances.push(balance);
    if (balance <= 0) failures++;
    total++;
  }
  return {
    successRate: 1 - failures / total,
    windowsTested: total,
    failures,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Run our engine with a custom crash frequency
// ──────────────────────────────────────────────────────────────────────
function runOurEngineWithCrashFreq(s: ExternalScenario, crashFrequency: number) {
  const startAge = 65;
  const endAge = startAge + s.years;

  const scenario: ScenarioInput = {
    ...DEFAULT_SCENARIO,
    currentAge: startAge,
    retirementAge: startAge,
    endAge,
    filingStatus: 'single',
    jobs: [],
    totalSavingsRate: 0,
    baseAnnualSpending: s.annualSpending / 12,
    spendingInflationRate: 0.025,
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 99,
    pensionAmount: 0,
    otherIncomeSources: [],
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    cashBuffer: { ...DEFAULT_SCENARIO.cashBuffer, enabled: false },
    balances: {
      traditional401k: 0, roth401k: 0, traditionalIRA: 0, rothIRA: 0,
      taxable: s.initialBalance, hsa: 0, cashAccount: 0, otherAssets: 0,
    },
    taxableCostBasisPct: 1.0,
    investments: {
      mode: 'simple',
      riskProfile: 'balanced',
      preRetirement: makeUniformAllocations({ stocks: s.stockPct * 100, bonds: s.bondPct * 100, cash: 0, crypto: 0 }),
      postRetirement: makeUniformAllocations({ stocks: s.stockPct * 100, bonds: s.bondPct * 100, cash: 0, crypto: 0 }),
      assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
      crashFrequency,
    },
  };
  const result = runSimulation(scenario, { numSimulations: 5000, seed: 12345 });
  return { successRate: result.successRate };
}

function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────
function main() {
  console.log('Pessimism diagnosis — running ...\n');

  const lines: string[] = [];
  lines.push('# Pessimism Diagnosis: Why Our MC Engine Is Tougher Than History');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push(`Subtracting an assumed long-run inflation of ${pct(ASSUMED_INFLATION)} to convert nominal MC returns to real terms for apples-to-apples comparison with Shiller historical data.`);
  lines.push('');

  // ────────────────────────────────────────────────────────────────
  // H1 + H2: Distribution comparison on 75/25 (matches trinity-75-25)
  // ────────────────────────────────────────────────────────────────
  lines.push('## Distribution Comparison: 75/25 Portfolio, 30-Year Sequences');
  lines.push('');
  const stockPct = 0.75, bondPct = 0.25, years = 30;

  console.log('H1+H2: Sampling MC and historical 30-year sequences (75/25) ...');
  const mcSeqsDefault = sampleEngineSequences(NUM_SAMPLES, years, stockPct, bondPct, DEFAULT_CRASH_FREQUENCY);
  const mcSeqsLowCrash = sampleEngineSequences(NUM_SAMPLES, years, stockPct, bondPct, 1);
  const histSeqsAll = sampleHistoricalSequences(years, stockPct, bondPct);
  const histSeqs1928 = sampleHistoricalSequences(years, stockPct, bondPct, 1928);

  const sDefault = computeStats('MC default (cf=5.5)', mcSeqsDefault);
  const sLowCrash = computeStats('MC low crashes (cf=1)', mcSeqsLowCrash);
  const sHistAll = computeStats('Historical 1872-2022', histSeqsAll);
  const sHist1928 = computeStats('Historical 1928-2022', histSeqs1928);

  const dCols = ['Source', 'Mean real return', 'Std', 'Median 30y CAGR', 'P10 30y CAGR', 'Worst 30y CAGR', 'Worst rolling 10y CAGR', '% negative years'];
  lines.push('| ' + dCols.join(' | ') + ' |');
  lines.push('|' + dCols.map(() => '---').join('|') + '|');
  for (const s of [sHistAll, sHist1928, sDefault, sLowCrash]) {
    lines.push(`| ${s.label} | ${pct(s.meanRealReturn, 2)} | ${pct(s.stdRealReturn, 2)} | ${pct(s.cagr30Median, 2)} | ${pct(s.cagr30P10, 2)} | ${pct(s.cagr30Worst, 2)} | ${pct(s.worst10yrCagr, 2)} | ${pct(s.pctYearsNegative, 0)} |`);
  }
  lines.push('');

  // H1 verdict
  const h1Ok = sDefault.meanRealReturn >= sHist1928.meanRealReturn - 0.005;
  lines.push(`**H1 (mean returns too low?):** Default MC mean real return = ${pct(sDefault.meanRealReturn, 2)} vs. Historical 1928+ = ${pct(sHist1928.meanRealReturn, 2)}. **${h1Ok ? 'REJECTED' : 'CONFIRMED'}** — engine's central tendency is ${h1Ok ? 'in line with' : 'meaningfully below'} modern history.`);
  lines.push('');

  // H2 verdict
  const tailGap = sHist1928.cagr30Worst - sDefault.cagr30Worst;
  const h2Confirmed = tailGap > 0.01; // MC's worst is >1pp worse than history's worst
  lines.push(`**H2 (fatter left tail?):** Worst 30-year CAGR — MC default = ${pct(sDefault.cagr30Worst, 2)} vs. Historical 1928+ = ${pct(sHist1928.cagr30Worst, 2)}. Gap = ${pct(tailGap, 2)}. **${h2Confirmed ? 'CONFIRMED' : 'REJECTED'}** — MC's worst sequences are ${h2Confirmed ? 'meaningfully worse than' : 'in line with'} the worst 30 years US investors actually saw (1929, 1966, 2000).`);
  lines.push('');

  // ────────────────────────────────────────────────────────────────
  // H3: Bengen restricted to 1928+
  // ────────────────────────────────────────────────────────────────
  lines.push('## H3: Bengen Restricted to 1928+ Closes the Date-Bias Gap');
  lines.push('');
  console.log('H3: Re-running Bengen with 1928+ floor ...');
  const h3Cols = ['Scenario', 'Bengen full (1872+)', 'Bengen modern (1928+)', 'Our MC', 'Δ MC vs 1928+'];
  lines.push('| ' + h3Cols.join(' | ') + ' |');
  lines.push('|' + h3Cols.map(() => '---').join('|') + '|');
  for (const sc of CANONICAL_SCENARIOS) {
    const full = runBengen(sc);
    const mod = runBengenRestricted(sc, 1928);
    const ours = runOurEngine(sc, 5000);
    const delta = (ours.successRate - mod.successRate) * 100;
    lines.push(`| ${sc.id} | ${pct(full.successRate)} | ${pct(mod.successRate)} (${mod.windowsTested} windows) | ${pct(ours.successRate)} | ${delta.toFixed(1)}pp |`);
  }
  lines.push('');
  lines.push('If the gap is mostly driven by Bengen including the unusually-good 1872-1927 era, restricting to 1928+ should bring Bengen closer to our MC numbers.');
  lines.push('');

  // ────────────────────────────────────────────────────────────────
  // H4: Ablate regime-switching
  // ────────────────────────────────────────────────────────────────
  lines.push('## H4: Reduce Crash Frequency to Test Regime-Switching Impact');
  lines.push('');
  console.log('H4: Running our engine at low crash frequency ...');
  const h4Cols = ['Scenario', 'MC default (cf=5.5)', 'MC low crashes (cf=1)', 'Bengen 1928+', 'Δ low-crash vs default'];
  lines.push('| ' + h4Cols.join(' | ') + ' |');
  lines.push('|' + h4Cols.map(() => '---').join('|') + '|');
  for (const sc of CANONICAL_SCENARIOS) {
    const def = runOurEngineWithCrashFreq(sc, DEFAULT_CRASH_FREQUENCY);
    const low = runOurEngineWithCrashFreq(sc, 1);
    const beng = runBengenRestricted(sc, 1928);
    const closeGap = (low.successRate - def.successRate) * 100;
    lines.push(`| ${sc.id} | ${pct(def.successRate)} | ${pct(low.successRate)} | ${pct(beng.successRate)} | +${closeGap.toFixed(1)}pp |`);
  }
  lines.push('');
  lines.push('If crash frequency is the main lever, low-crash MC should land near Bengen 1928+.');
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('See verdicts above. Common patterns:');
  lines.push('');
  lines.push('- If H1 is REJECTED but H2 is CONFIRMED, the engine is correctly calibrated on average but models worse tail outcomes than US history. This is defensible (US 20th century was unusually good); calibrate to taste.');
  lines.push('- If H3 closes most of the gap, Bengen-style comparisons are the misleading benchmark — they cherry-pick a favorable era.');
  lines.push('- If H4 closes most of the gap, regime-switching is doing the heavy lifting on pessimism. The bear-frequency slider lets users calibrate this.');
  lines.push('');

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`\nReport written: ${OUT_FILE}`);
}

main();
