/**
 * Bear-clustering diagnostic.
 *
 * Counts how often our MC engine produces N consecutive bear years
 * (in 30-year sequences) and compares to historical 1928-2022.
 *
 * A bear year, historically, is defined as a year where the real
 * blended portfolio return was negative. (Match-the-engine: a bear
 * *regime* year, which forces a negative mean.)
 *
 * Usage:  npx tsx scripts/external-benchmarks/diagnose-clusters.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHistoricalReturns } from './historical-data';
import { PRNG, cholesky, generateCorrelatedReturns, crashFrequencyToSteadyState } from '../../src/engine/math';
import {
  DEFAULT_CORRELATION_MATRIX, BEAR_CORRELATION_MATRIX, DEFAULT_ASSET_RETURNS,
  BEAR_PERSISTENCE, BEAR_BOND_MEAN,
  POST_BEAR_RECOVERY_YEAR1_MEAN, POST_BEAR_RECOVERY_YEAR2_MEAN,
  DEFAULT_CRASH_FREQUENCY, MAX_BEAR_DURATION,
} from '../../src/constants/asset-classes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_FILE = join(REPO_ROOT, 'benchmarks', 'cluster-diagnosis.md');

const NUM_SAMPLES = 10_000;
const YEARS = 30;
const STOCK_PCT = 0.75;
const BOND_PCT = 0.25;
const ASSUMED_INFLATION = 0.025;

/** Returns parallel arrays of {realReturns, regimeFlags} for one path. */
function sampleEngineSequence(
  rng: PRNG,
  bullL: number[][],
  bearL: number[][],
  years: number,
  crashFreq: number,
): { realReturns: number[]; isBearRegime: boolean[] } {
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
  const regimeMask = [true, false, false, true];

  const bearSteady = crashFrequencyToSteadyState(crashFreq);
  const enterBear = bearSteady * (1 - BEAR_PERSISTENCE) / (1 - bearSteady);

  let inBear = rng.next() < bearSteady;
  let bearDuration = inBear ? 1 : 0;
  let recoveryYearsRemaining = 0;
  let lastBearDuration = 0;

  const realReturns: number[] = [];
  const isBearRegime: boolean[] = [];

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
    const L = inBear ? bearL : bullL;
    const yearMeans = inBear ? bearMeans : means;
    let boost: number | undefined;
    if (!inBear && recoveryYearsRemaining > 0) {
      const isFirst = (lastBearDuration >= 2 && recoveryYearsRemaining === 2) ||
                      (lastBearDuration === 1 && recoveryYearsRemaining === 1);
      const baseMean = isFirst ? POST_BEAR_RECOVERY_YEAR1_MEAN : POST_BEAR_RECOVERY_YEAR2_MEAN;
      const scale = Math.min(1, 0.5 + 0.25 * lastBearDuration);
      boost = baseMean * scale;
    }
    const r = generateCorrelatedReturns(rng, L, yearMeans, stdDevs, inBear, regimeMask, boost);
    const nom = STOCK_PCT * r[0] + BOND_PCT * r[1];
    const real = (1 + nom) / (1 + ASSUMED_INFLATION) - 1;
    realReturns.push(real);
    isBearRegime.push(inBear);
  }
  return { realReturns, isBearRegime };
}

/** Count run lengths of consecutive `true` (or negative) values in a sequence. */
function runLengths(flags: boolean[]): number[] {
  const runs: number[] = [];
  let cur = 0;
  for (const f of flags) {
    if (f) cur++;
    else if (cur > 0) { runs.push(cur); cur = 0; }
  }
  if (cur > 0) runs.push(cur);
  return runs;
}

/** Histogram of "did a 30-year window contain a run of length >= N?" */
function shareWithMinRun(allRuns: number[][], minLength: number): number {
  let hits = 0;
  for (const seqRuns of allRuns) {
    if (seqRuns.some(r => r >= minLength)) hits++;
  }
  return hits / allRuns.length;
}

function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

function main() {
  console.log('Bear-cluster diagnostic — running ...\n');

  const bullL = cholesky(DEFAULT_CORRELATION_MATRIX);
  const bearL = cholesky(BEAR_CORRELATION_MATRIX);

  // ── 1. Sample MC sequences at default and low crash frequency ──
  const mcDefault = { regimeRuns: [] as number[][], negRuns: [] as number[][] };
  const mcLow = { regimeRuns: [] as number[][], negRuns: [] as number[][] };
  const rngDef = new PRNG(20260611);
  const rngLow = new PRNG(20260611);

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const d = sampleEngineSequence(rngDef, bullL, bearL, YEARS, DEFAULT_CRASH_FREQUENCY);
    const l = sampleEngineSequence(rngLow, bullL, bearL, YEARS, 1);
    mcDefault.regimeRuns.push(runLengths(d.isBearRegime));
    mcDefault.negRuns.push(runLengths(d.realReturns.map(r => r < 0)));
    mcLow.regimeRuns.push(runLengths(l.isBearRegime));
    mcLow.negRuns.push(runLengths(l.realReturns.map(r => r < 0)));
  }

  // ── 2. Sample historical 30-year rolling windows ──
  const hist = loadHistoricalReturns();
  const histNegRuns: number[][] = [];
  const startIdx = hist.years.findIndex(y => y >= 1928);
  for (let s = startIdx; s + YEARS <= hist.years.length; s++) {
    const seq: number[] = [];
    for (let k = 0; k < YEARS; k++) {
      seq.push(STOCK_PCT * hist.stocks[s + k] + BOND_PCT * hist.bonds[s + k]);
    }
    histNegRuns.push(runLengths(seq.map(r => r < 0)));
  }

  // ── 3. Build report ──
  const lines: string[] = [];
  lines.push('# Bear-Cluster Diagnosis');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push(`How often do 30-year sequences contain runs of N consecutive bear/negative years? ${NUM_SAMPLES.toLocaleString()} MC samples vs ${histNegRuns.length} historical 30-year windows (1928+, 75/25 portfolio).`);
  lines.push('');

  // Table A: share of 30y windows containing a run >= N negative-return years
  lines.push('## Share of 30-Year Windows Containing N+ Consecutive Negative Real Years');
  lines.push('');
  lines.push('Compares the most universal definition of a "bad streak": consecutive years where the real blended return was negative.');
  lines.push('');
  const cols = ['Run length', 'Historical 1928+', 'MC default (cf=5.5)', 'MC low (cf=1)', 'MC vs Hist (default)'];
  lines.push('| ' + cols.join(' | ') + ' |');
  lines.push('|' + cols.map(() => '---').join('|') + '|');
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const histShare = shareWithMinRun(histNegRuns, n);
    const defShare = shareWithMinRun(mcDefault.negRuns, n);
    const lowShare = shareWithMinRun(mcLow.negRuns, n);
    const delta = (defShare - histShare) * 100;
    lines.push(`| ≥${n} years | ${pct(histShare)} | ${pct(defShare)} | ${pct(lowShare)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp |`);
  }
  lines.push('');

  // Table B: share of 30y windows containing a run >= N bear-regime years (MC only)
  lines.push('## Share of 30-Year Windows Containing N+ Consecutive Bear-Regime Years (MC Only)');
  lines.push('');
  lines.push('Bear-regime years are the engine\'s Markov state, distinct from any individual year\'s realized return. This shows how sticky the bear regime itself is.');
  lines.push('');
  const cols2 = ['Run length', 'MC default (cf=5.5)', 'MC low (cf=1)'];
  lines.push('| ' + cols2.join(' | ') + ' |');
  lines.push('|' + cols2.map(() => '---').join('|') + '|');
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const defShare = shareWithMinRun(mcDefault.regimeRuns, n);
    const lowShare = shareWithMinRun(mcLow.regimeRuns, n);
    lines.push(`| ≥${n} years | ${pct(defShare)} | ${pct(lowShare)} |`);
  }
  lines.push('');

  // Table C: max run distribution
  lines.push('## Maximum Run Length Per 30-Year Window (Negative-Return Years)');
  lines.push('');
  const maxRuns = (sets: number[][]) => sets.map(s => s.length > 0 ? Math.max(...s) : 0);
  const histMax = maxRuns(histNegRuns).sort((a, b) => a - b);
  const defMax = maxRuns(mcDefault.negRuns).sort((a, b) => a - b);
  const lowMax = maxRuns(mcLow.negRuns).sort((a, b) => a - b);
  const stat = (a: number[]) => ({
    median: a[Math.floor(a.length / 2)],
    p90: a[Math.floor(a.length * 0.90)],
    p99: a[Math.floor(a.length * 0.99)],
    max: a[a.length - 1],
  });
  const sH = stat(histMax), sD = stat(defMax), sL = stat(lowMax);
  const cols3 = ['Stat', 'Historical 1928+', 'MC default', 'MC low crash'];
  lines.push('| ' + cols3.join(' | ') + ' |');
  lines.push('|' + cols3.map(() => '---').join('|') + '|');
  lines.push(`| Median max-run | ${sH.median} | ${sD.median} | ${sL.median} |`);
  lines.push(`| P90 max-run | ${sH.p90} | ${sD.p90} | ${sL.p90} |`);
  lines.push(`| P99 max-run | ${sH.p99} | ${sD.p99} | ${sL.p99} |`);
  lines.push(`| Worst-case max-run | ${sH.max} | ${sD.max} | ${sL.max} |`);
  lines.push('');

  // Verdict
  lines.push('## Verdict');
  lines.push('');
  const histShare4 = shareWithMinRun(histNegRuns, 4);
  const defShare4 = shareWithMinRun(mcDefault.negRuns, 4);
  const ratio4 = histShare4 > 0 ? defShare4 / histShare4 : Infinity;
  lines.push(`- **4+ year negative-return streaks** happen in ${pct(histShare4)} of historical 30-year windows but ${pct(defShare4)} of MC default windows (${isFinite(ratio4) ? ratio4.toFixed(1) + '×' : '∞×'} more often).`);
  const histShare5 = shareWithMinRun(histNegRuns, 5);
  const defShare5 = shareWithMinRun(mcDefault.negRuns, 5);
  lines.push(`- **5+ year streaks** are ${histShare5 === 0 ? 'never seen historically' : pct(histShare5)} but appear in ${pct(defShare5)} of MC default windows.`);
  lines.push(`- **Worst-ever historical streak**: ${sH.max} consecutive negative years. **Worst MC streak**: ${sD.max} consecutive negative years.`);
  lines.push('');
  lines.push('If the MC engine produces 4–8 year streaks at meaningfully higher rates than history, this is the mechanism causing the engine\'s pessimistic tail outcomes seen in `pessimism-diagnosis.md`.');
  lines.push('');

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`Report written: ${OUT_FILE}`);
}

main();
