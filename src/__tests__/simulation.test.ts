import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';

describe('runSimulation', () => {
  it('runs with default scenario and produces valid result', () => {
    const result = runSimulation(DEFAULT_SCENARIO, { numSimulations: 10, seed: 42 });
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    expect(result.endingBalances).toHaveLength(10);
    expect(result.percentileBands.length).toBeGreaterThan(0);
    expect(result.medianPath.length).toBeGreaterThan(0);
    expect(result.worstDecilePath.length).toBeGreaterThan(0);
  });

  it('is deterministic with same seed', () => {
    const r1 = runSimulation(DEFAULT_SCENARIO, { numSimulations: 10, seed: 123 });
    const r2 = runSimulation(DEFAULT_SCENARIO, { numSimulations: 10, seed: 123 });
    expect(r1.successRate).toBe(r2.successRate);
    expect(r1.endingBalances).toEqual(r2.endingBalances);
  });

  it('produces different results with different seeds', () => {
    const r1 = runSimulation(DEFAULT_SCENARIO, { numSimulations: 10, seed: 1 });
    const r2 = runSimulation(DEFAULT_SCENARIO, { numSimulations: 10, seed: 2 });
    // Extremely unlikely to be identical
    expect(r1.endingBalances).not.toEqual(r2.endingBalances);
  });

  it('reports progress via callback', () => {
    const progressCalls: number[] = [];
    runSimulation(DEFAULT_SCENARIO, { numSimulations: 100, seed: 42 }, (completed) => {
      progressCalls.push(completed);
    });
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1]).toBe(100);
  });

  it('handles zero spending scenario (100% success)', () => {
    const input = {
      ...DEFAULT_SCENARIO,
      baseAnnualSpending: 0,
      socialSecurityBenefit: 0,
      pensionAmount: 0,
    };
    const result = runSimulation(input, { numSimulations: 10, seed: 42 });
    expect(result.successRate).toBe(1);
  });
});
