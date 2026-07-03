/**
 * Decompose the gap between our engine (~48%) and textbook (~96%) for
 * the user's 11kAt55 scenario.
 *
 * Method: run the same scenario through many variants, changing ONE
 * assumption at a time, and see which variant closes how much of the gap.
 *
 * Ablations:
 *  A. Baseline (as user has it)
 *  B. crashFrequency lowered to 5.5 (default/historical)
 *  C. crashFrequency lowered to 3 (optimistic)
 *  D. crashFrequency = 1 (essentially no crash regime)
 *  E. Reduce spousal-age gap effect by claiming SS at same age
 *  F. Stocks mean 8% → 10% (matches DEFAULT_ASSET_RETURNS)
 *  G. Combined: crashFrequency=5.5 AND stocks=10%
 *  H. Bonds bumped to historical (4.5% → 5%)
 *  I. All defaults engaged (stocks=10%, bonds=5%, cash=2.5%, cf=5.5)
 *  J. Post-retirement allocation more stock-heavy (60/30/10 → 70/30/0)
 *  K. Full defaults + guardrails enabled
 */

import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../src/constants/defaults';
import { makeUniformAllocations } from '../src/constants/asset-classes';
import type { ScenarioInput } from '../src/types';

const raw = JSON.parse(readFileSync('/Users/mm39036/Downloads/11kAt55 (2).json', 'utf-8'));
const base: ScenarioInput = { ...DEFAULT_SCENARIO, ...raw };

const N = 3000;
const SEED = 42;

function runVariant(name: string, mutate: (s: ScenarioInput) => ScenarioInput) {
  const s = mutate(structuredClone(base));
  const r = runSimulation(s, { numSimulations: N, seed: SEED });
  const sorted = [...r.endingBalances].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.10)];
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  console.log(
    `${name.padEnd(48)} success=${(r.successRate * 100).toFixed(1).padStart(5)}%  ` +
    `p10=$${(p10 / 1000).toFixed(0).padStart(6)}K  ` +
    `p50=$${(p50 / 1000).toFixed(0).padStart(6)}K  ` +
    `p90=$${(p90 / 1000).toFixed(0).padStart(6)}K`
  );
}

console.log('\n══════════════════════════════════════════════════════════════════════════════════');
console.log(' DECOMPOSING THE CONSERVATISM: user scenario, one knob at a time');
console.log('══════════════════════════════════════════════════════════════════════════════════');
console.log(`  ${'variant'.padEnd(48)} ${'success'.padStart(11)}  ${'p10 end'.padStart(10)}  ${'median end'.padStart(11)}  ${'p90 end'.padStart(10)}`);
console.log('  ────────────────────────────────────────────────────────────────────────────────');

// A. Baseline
runVariant('A. Baseline (user scenario as-is)', s => s);

// B. crashFrequency 5.5 (historical)
runVariant('B. crashFrequency 6.5 → 5.5 (historical)', s => {
  s.investments.crashFrequency = 5.5;
  return s;
});

// C. crashFrequency 3
runVariant('C. crashFrequency 6.5 → 3 (optimistic)', s => {
  s.investments.crashFrequency = 3;
  return s;
});

// D. crashFrequency 1 (nearly no crashes)
runVariant('D. crashFrequency 6.5 → 1 (near-zero bear years)', s => {
  s.investments.crashFrequency = 1;
  return s;
});

// E. Stocks mean 8% → 10% (matches historical S&P nominal)
runVariant('E. stocks.mean 8% → 10% (historical nominal)', s => {
  s.investments.assetClassReturns.stocks.mean = 0.10;
  return s;
});

// F. Bonds mean 4.5% → 5% (historical intermediate treasuries)
runVariant('F. bonds.mean 4.5% → 5.0%', s => {
  s.investments.assetClassReturns.bonds.mean = 0.05;
  return s;
});

// G. Combined: cf=5.5 AND stocks=10%
runVariant('G. cf 5.5 + stocks 10% (both fixes)', s => {
  s.investments.crashFrequency = 5.5;
  s.investments.assetClassReturns.stocks.mean = 0.10;
  return s;
});

// H. All-defaults returns (stocks=10, bonds=4, cash=2.5, cf=5.5)
runVariant('H. All-default returns + cf 5.5', s => {
  s.investments.crashFrequency = 5.5;
  s.investments.assetClassReturns.stocks = { mean: 0.10, stdDev: 0.16 };
  s.investments.assetClassReturns.bonds = { mean: 0.04, stdDev: 0.06 };
  s.investments.assetClassReturns.cash = { mean: 0.025, stdDev: 0.01 };
  return s;
});

// I. Same as H but post-retirement 70/25/5 (less cash drag)
runVariant('I. H + post-ret 70/25/5 (less cash drag)', s => {
  s.investments.crashFrequency = 5.5;
  s.investments.assetClassReturns.stocks = { mean: 0.10, stdDev: 0.16 };
  s.investments.assetClassReturns.bonds = { mean: 0.04, stdDev: 0.06 };
  s.investments.assetClassReturns.cash = { mean: 0.025, stdDev: 0.01 };
  s.investments.postRetirement = makeUniformAllocations({ stocks: 70, bonds: 25, cash: 5, crypto: 0 });
  return s;
});

// J. Enable guardrails (20% drawdown → 20% cut, 30% → 30%)
runVariant('J. Baseline + guardrails ON', s => {
  s.guardrails.enabled = true;
  return s;
});

// K. Combine everything reasonable
runVariant('K. cf 5.5 + stocks 10% + guardrails ON', s => {
  s.investments.crashFrequency = 5.5;
  s.investments.assetClassReturns.stocks.mean = 0.10;
  s.guardrails.enabled = true;
  return s;
});

// L. Reference: same as K but no cash allocation
runVariant('L. K + post-ret 60/40 (no cash class)', s => {
  s.investments.crashFrequency = 5.5;
  s.investments.assetClassReturns.stocks.mean = 0.10;
  s.guardrails.enabled = true;
  s.investments.postRetirement = makeUniformAllocations({ stocks: 60, bonds: 40, cash: 0, crypto: 0 });
  return s;
});

console.log('══════════════════════════════════════════════════════════════════════════════════\n');
