import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { CANONICAL_SCENARIOS, type ExternalScenario } from '../../scripts/external-benchmarks/scenarios';
import { runBengen } from '../../scripts/external-benchmarks/bengen-engine';
import { buildScenario } from '../../scripts/external-benchmarks/our-engine-adapter';

/**
 * External benchmark regression gate.
 *
 * Compares the Monte Carlo engine against the historical record (Bengen-style
 * rolling windows over the checked-in Shiller dataset) on canonical
 * single-pool, no-tax, no-SS scenarios.
 *
 * The engine is EXPECTED to sit a few points below history: Monte Carlo
 * explores sequences worse than the single historical sample. These tests
 * pin that gap so calibration changes can't silently drift it in either
 * direction. If you intentionally recalibrate the return model, re-run,
 * eyeball the new gaps, and update the bands.
 */

const SIMS = 2000;
const SEED = 12345;

function scenario(id: string): ExternalScenario {
  const s = CANONICAL_SCENARIOS.find(s => s.id === id);
  if (!s) throw new Error(`unknown canonical scenario: ${id}`);
  return s;
}

function mcSuccessRate(s: ExternalScenario): number {
  const result = runSimulation(buildScenario(s), { numSimulations: SIMS, seed: SEED });
  return result.successRate;
}

describe('Monte Carlo vs historical record (tight anchors)', () => {
  // Gap bands: [historical − 8pp, historical + 2pp]
  const GAP_LO = -0.08;
  const GAP_HI = 0.02;

  it.each([
    'bengen-classic-50-50',      // 50/50, 4%, 30y — hist ≈ 94%
    'conservative-60-40-3pct',   // 60/40, 3%, 30y — hist = 100%
    'aggressive-60-40-5pct',     // 60/40, 5%, 30y — hist ≈ 75%
  ])('%s: MC success within [hist−8pp, hist+2pp]', (id) => {
    const s = scenario(id);
    const hist = runBengen(s).successRate;
    const ours = mcSuccessRate(s);
    expect(ours - hist).toBeGreaterThanOrEqual(GAP_LO);
    expect(ours - hist).toBeLessThanOrEqual(GAP_HI);
  });
});

describe('Withdrawal-rate shape (60/40, 30y)', () => {
  it('success falls monotonically as the withdrawal rate rises: 3% > 4% > 5%', () => {
    const base = scenario('conservative-60-40-3pct');
    const at = (rate: number): ExternalScenario => ({
      ...base,
      id: `60-40-${rate}`,
      annualSpending: base.initialBalance * rate,
    });

    const s3 = mcSuccessRate(at(0.03));
    const s4 = mcSuccessRate(at(0.04));
    const s5 = mcSuccessRate(at(0.05));

    // Ordering with meaningful gaps — catches a flattened or inverted
    // success curve that single-point anchors would miss.
    expect(s3 - s4).toBeGreaterThanOrEqual(0.02);
    expect(s4 - s5).toBeGreaterThanOrEqual(0.05);
    // Absolute plausibility rails
    expect(s3).toBeGreaterThanOrEqual(0.93);
    expect(s5).toBeLessThanOrEqual(0.85);
  });
});

describe('Known calibration gaps (guarded, not endorsed)', () => {
  // The regime model runs pessimistic on stock-heavy and long-horizon
  // scenarios (see benchmarks/pessimism-diagnosis.md). These bands keep the
  // known gap from silently widening — or "improving" without review.

  it('trinity-75-25: gap vs history stays within [−15pp, −2pp]', () => {
    const s = scenario('trinity-75-25');
    const gap = mcSuccessRate(s) - runBengen(s).successRate;
    expect(gap).toBeGreaterThanOrEqual(-0.15);
    expect(gap).toBeLessThanOrEqual(-0.02);
  });

  it('long-horizon-fire (75/25, 50y): gap vs history stays within [−18pp, −2pp]', () => {
    const s = scenario('long-horizon-fire');
    const gap = mcSuccessRate(s) - runBengen(s).successRate;
    expect(gap).toBeGreaterThanOrEqual(-0.18);
    expect(gap).toBeLessThanOrEqual(-0.02);
  });
});
