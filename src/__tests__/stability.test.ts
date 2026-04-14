import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';

describe('PRNG stability', () => {
  it('10 runs of 1000 sims should have spread < 5pp', () => {
    const rates: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const r = runSimulation(DEFAULT_SCENARIO, { numSimulations: 1000, seed: i * 7919 });
      rates.push(r.successRate * 100);
    }
    const spread = Math.max(...rates) - Math.min(...rates);
    console.log('Rates:', rates.map(r => r.toFixed(1) + '%').join(', '));
    console.log('Spread:', spread.toFixed(1) + 'pp');
    expect(spread).toBeLessThan(5);
  });
});
