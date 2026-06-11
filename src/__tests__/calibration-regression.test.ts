import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import {
  BULL_REGIME,
  BEAR_REGIME,
  BEAR_PERSISTENCE,
  MAX_BEAR_DURATION,
  POST_BEAR_RECOVERY_YEAR1_MEAN,
  POST_BEAR_RECOVERY_YEAR2_MEAN,
  DEFAULT_CRASH_FREQUENCY,
} from '../constants/asset-classes';
import { PRNG, crashFrequencyToSteadyState } from '../engine/math';
import type { ScenarioInput } from '../types';

/**
 * Calibration regression tests.
 *
 * These lock in the central-tendency and tail behavior of the engine's
 * regime-switching model so that any future tuning of regime constants
 * (BULL_REGIME, BEAR_REGIME, BEAR_PERSISTENCE, MAX_BEAR_DURATION,
 * POST_BEAR_RECOVERY_*) is forced to re-justify itself against historical
 * benchmarks. They guard against silent drift in:
 *   - mean real return for 75/25 over 30 years (target ~6.82% historical 1928+)
 *   - frequency of long bear streaks (historical max = 3 consecutive negative
 *     real years for 75/25; engine must not exceed MAX_BEAR_DURATION)
 *   - default-scenario success rate stability
 *
 * If you intentionally retune the engine, expect these to fail and update
 * the locked-in numbers consciously — that's the point.
 */

// ── Standalone regime sampler (mirrors engine/simulation.ts) ──
// Generates 75/25 portfolio annual real returns under the engine's
// Markov regime model. Used to compute calibration statistics without
// running the full simulation (much faster, ~100k draws in <1s).
function sampleAnnualReturns(numYears: number, seed: number, crashFreq: number = DEFAULT_CRASH_FREQUENCY): number[] {
  const rng = new PRNG(seed);
  const out: number[] = [];
  const bearSteadyState = crashFrequencyToSteadyState(crashFreq);
  const enterBear = bearSteadyState * (1 - BEAR_PERSISTENCE) / (1 - bearSteadyState);

  let inBear = rng.next() < bearSteadyState;
  let bearDuration = inBear ? 1 : 0;
  let recoveryYearsRemaining = 0;
  let lastBearDuration = 0;

  for (let y = 0; y < numYears; y++) {
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

    let stockMean: number;
    let stockVol: number;
    if (inBear) {
      stockMean = BEAR_REGIME.mean;
      stockVol = BEAR_REGIME.vol;
    } else if (recoveryYearsRemaining > 0) {
      const isYear1 = (lastBearDuration >= 2 && recoveryYearsRemaining === 2) ||
                      (lastBearDuration === 1 && recoveryYearsRemaining === 1);
      const baseMean = isYear1 ? POST_BEAR_RECOVERY_YEAR1_MEAN : POST_BEAR_RECOVERY_YEAR2_MEAN;
      const scale = Math.min(1, 0.5 + 0.25 * lastBearDuration);
      stockMean = baseMean * scale;
      stockVol = BULL_REGIME.vol;
    } else {
      stockMean = BULL_REGIME.mean;
      stockVol = BULL_REGIME.vol;
    }

    // Bond return: 6.5% mean in bear (rate cuts), 4% otherwise
    const bondMean = inBear ? 0.065 : 0.04;
    const bondVol = 0.06;

    const stockReturn = stockMean + stockVol * rng.nextGaussian();
    const bondReturn = bondMean + bondVol * rng.nextGaussian();

    // 75/25 blend, deflate to real (assume 2.5% long-run inflation)
    const nominal = 0.75 * stockReturn + 0.25 * bondReturn;
    const real = (1 + nominal) / 1.025 - 1;
    out.push(real);
  }
  return out;
}

function geometricMean(returns: number[]): number {
  let log = 0;
  for (const r of returns) log += Math.log(1 + r);
  return Math.exp(log / returns.length) - 1;
}

function arithmeticMean(returns: number[]): number {
  return returns.reduce((s, r) => s + r, 0) / returns.length;
}

describe('Calibration regression — 75/25 real returns', () => {
  // Locked values reflect the current calibration (bear persistence 0.40,
  // bear cap 4, recovery boost halved to 0.22/0.18). If you retune, update.
  const SAMPLE_YEARS = 50_000;
  const SEED = 12345;

  it('arithmetic mean real return matches historical 1928+ (target 6.82%, ±0.5pp)', () => {
    const returns = sampleAnnualReturns(SAMPLE_YEARS, SEED);
    const mean = arithmeticMean(returns);
    expect(mean).toBeGreaterThan(0.0632); // 6.32%
    expect(mean).toBeLessThan(0.0732);    // 7.32%
  });

  it('geometric mean (CAGR) is within reasonable real-return range (target ~5.7%, ±1pp)', () => {
    const returns = sampleAnnualReturns(SAMPLE_YEARS, SEED);
    const cagr = geometricMean(returns);
    expect(cagr).toBeGreaterThan(0.047);  // 4.7%
    expect(cagr).toBeLessThan(0.067);     // 6.7%
  });

  it('negative-year frequency matches historical (target ~27%, ±5pp)', () => {
    const returns = sampleAnnualReturns(SAMPLE_YEARS, SEED);
    const negCount = returns.filter(r => r < 0).length;
    const frac = negCount / returns.length;
    expect(frac).toBeGreaterThan(0.22);
    expect(frac).toBeLessThan(0.32);
  });
});

describe('Calibration regression — bear-streak bounds', () => {
  // The MAX_BEAR_DURATION cap means consecutive *bear-regime* years cannot
  // exceed MAX_BEAR_DURATION. Negative-return streaks can be slightly longer
  // due to unlucky bull-year noise stacking on the edges of a capped bear
  // cluster, so we test on 30-year windows (the planning-relevant horizon).

  it('share of 30-year windows with ≥5 consecutive negative years is rare (<5%)', () => {
    const NUM_WINDOWS = 2000;
    const WINDOW_YEARS = 30;
    let badWindows = 0;
    for (let w = 0; w < NUM_WINDOWS; w++) {
      const returns = sampleAnnualReturns(WINDOW_YEARS, 5_000_000 + w);
      let currentRun = 0;
      let maxRun = 0;
      for (const r of returns) {
        if (r < 0) {
          currentRun++;
          if (currentRun > maxRun) maxRun = currentRun;
        } else {
          currentRun = 0;
        }
      }
      if (maxRun >= 5) badWindows++;
    }
    const frac = badWindows / NUM_WINDOWS;
    expect(frac).toBeLessThan(0.05); // historical: 0%
  });
});

describe('Calibration regression — default scenario success rate', () => {
  // Lock in the engine's headline number for the default scenario so we
  // notice if some unrelated change shifts it materially. The default has
  // generous savings + balanced portfolio + long horizon → should be 80%+.
  it('default scenario success rate is in expected band (75-100%)', () => {
    const scenario: ScenarioInput = { ...DEFAULT_SCENARIO, socialSecurityMode: 'manual' };
    const result = runSimulation(scenario, { numSimulations: 500, seed: 42 });
    expect(result.successRate).toBeGreaterThan(0.75);
    expect(result.successRate).toBeLessThanOrEqual(1.0);
  });
});
