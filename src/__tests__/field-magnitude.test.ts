import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput } from '../types';

/**
 * Field magnitude tests.
 *
 * Floors-only tests ("changed by at least $500") catch dead controls but NOT
 * silent half-effects (a contribution accidentally divided by 2, a return
 * applied per-quarter instead of per-year, etc.). These tests bracket the
 * RELATIVE size of effect for a handful of highest-impact inputs so a halved
 * or doubled wiring bug would fail loudly.
 *
 * MAINTENANCE CONTRACT:
 *   Bands are wide (~±20pp around the current ratio) to tolerate normal
 *   engine tuning. If you intentionally change calibration (regime
 *   constants, recovery boost, correlations, tax brackets) and these fail,
 *   re-run the simulation, eyeball the new ratio, and update the band.
 *   Seed and SIMS are fixed; do not change them without re-baselining.
 */

const SIMS = 1000;
const SEED = 42;

function run(overrides: Partial<ScenarioInput>) {
  const scenario: ScenarioInput = { ...DEFAULT_SCENARIO, socialSecurityMode: 'manual', ...overrides };
  const result = runSimulation(scenario, { numSimulations: SIMS, seed: SEED });
  const sorted = [...result.endingBalances].sort((a, b) => a - b);
  return {
    successRate: result.successRate,
    medianEnding: sorted[Math.floor(sorted.length / 2)],
  };
}

function withInvestments(overrides: Partial<ScenarioInput['investments']>): ScenarioInput['investments'] {
  return { ...DEFAULT_SCENARIO.investments, ...overrides };
}

describe('Field magnitude bands', () => {
  it('stocks.mean: +4pp bump produces a 5x–9x lift in median ending', () => {
    // Catches the exact class of bug we just fixed (silently dead control)
    // AND catches if the wiring is half-strength or double-strength.
    // Compounding over 30+y amplifies a +4pp return delta dramatically.
    const baseline = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, stocks: { mean: 0.07, stdDev: 0.18 } },
    }) });
    const bumped = run({ investments: withInvestments({
      assetClassReturns: { ...DEFAULT_SCENARIO.investments.assetClassReturns, stocks: { mean: 0.11, stdDev: 0.18 } },
    }) });
    const ratio = bumped.medianEnding / baseline.medianEnding;
    expect(ratio).toBeGreaterThan(5.0);
    expect(ratio).toBeLessThan(9.5);
  });

  it('baseAnnualSpending: +25% bump cuts median ending to 30%–85% of baseline', () => {
    // Default scenario operates near the depletion threshold, so spending
    // is extremely high-leverage. Use a modest bump to avoid total depletion.
    const baseline = run({ baseAnnualSpending: 5000 });   // $60K/yr
    const higher = run({ baseAnnualSpending: 6250 });     // $75K/yr (+25%)
    const ratio = higher.medianEnding / baseline.medianEnding;
    expect(ratio).toBeGreaterThan(0.30);
    expect(ratio).toBeLessThan(0.85);
  });

  it('retirementAge: +10y delay raises success rate by 40–70 percentage points', () => {
    // Working longer is the largest user-controllable dial. The default
    // scenario has wide headroom between age-55 and age-65 retirement.
    const early = run({
      retirementAge: 55,
      jobs: [{ ...DEFAULT_SCENARIO.jobs[0], endAge: 55 }],
    });
    const later = run({
      retirementAge: 65,
      jobs: [{ ...DEFAULT_SCENARIO.jobs[0], endAge: 65 }],
    });
    const delta = later.successRate - early.successRate;
    expect(delta).toBeGreaterThan(0.40);
    expect(delta).toBeLessThan(0.70);
  });
});
