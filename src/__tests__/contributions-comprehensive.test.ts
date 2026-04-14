import { describe, it, expect } from 'vitest';
import { allocateContributions, type ContributionInput } from '../engine/contributions';
import { ACCOUNT_TYPES } from '../types';

const BASE_ALLOC = {
  traditional401k: 0, roth401k: 0, traditionalIRA: 0,
  rothIRA: 0, taxable: 0, hsa: 0,
  cashAccount: 0, otherAssets: 0,
};

function makeInput(overrides: Partial<ContributionInput>): ContributionInput {
  return {
    totalSavings: 20000,
    allocation: { ...BASE_ALLOC, taxable: 100 },
    age: 35,
    limit401k: 24500,
    limitIRA: 7500,
    enable401kCatchUp: false,
    enableIRACatchUp: false,
    employerMatch: 0,
    employerRothPct: 0,
    ...overrides,
  };
}

describe('Contribution allocation — comprehensive', () => {

  // ── Basic allocation math ──
  it('$120K salary × 20% rate, 50/20/30 split', () => {
    const input = makeInput({
      totalSavings: 24000,
      allocation: { ...BASE_ALLOC, traditional401k: 50, traditionalIRA: 20, taxable: 30 },
    });
    const r = allocateContributions(input);
    expect(r.contributions.traditional401k).toBeCloseTo(12000);
    expect(r.contributions.traditionalIRA).toBeCloseTo(4800);
    expect(r.contributions.taxable).toBeCloseTo(7200);
    expect(r.spilloverToTaxable).toBe(0);
  });

  // ── 401k limit ──
  it('401k traditional hits limit, excess spills to taxable', () => {
    const input = makeInput({
      totalSavings: 30000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
    });
    const r = allocateContributions(input);
    expect(r.contributions.traditional401k).toBeCloseTo(24500);
    expect(r.contributions.taxable).toBeCloseTo(5500);
    expect(r.spilloverToTaxable).toBeCloseTo(5500);
  });

  it('combined 401k trad+roth share same limit, proportional reduction', () => {
    const input = makeInput({
      totalSavings: 50000,
      allocation: { ...BASE_ALLOC, traditional401k: 50, roth401k: 50 },
    });
    const r = allocateContributions(input);
    // Each wants 25000, combined 50000, limit 24500
    expect(r.contributions.traditional401k + r.contributions.roth401k).toBeCloseTo(24500);
    // Proportional: each gets 12250
    expect(r.contributions.traditional401k).toBeCloseTo(12250);
    expect(r.contributions.roth401k).toBeCloseTo(12250);
    expect(r.spilloverToTaxable).toBeCloseTo(25500);
  });

  // ── IRA limit ──
  it('combined IRA trad+roth hits limit', () => {
    const input = makeInput({
      totalSavings: 20000,
      allocation: { ...BASE_ALLOC, traditionalIRA: 40, rothIRA: 60 },
    });
    const r = allocateContributions(input);
    // Desired: 8000 + 12000 = 20000, limit 7500
    const totalIRA = r.contributions.traditionalIRA + r.contributions.rothIRA;
    expect(totalIRA).toBeCloseTo(7500);
    // Proportional split
    expect(r.contributions.traditionalIRA).toBeCloseTo(7500 * 0.4);
    expect(r.contributions.rothIRA).toBeCloseTo(7500 * 0.6);
    expect(r.spilloverToTaxable).toBeCloseTo(12500);
  });

  // ── Both 401k and IRA over limit simultaneously ──
  it('both 401k and IRA over limits → both spill to taxable', () => {
    const input = makeInput({
      totalSavings: 80000,
      allocation: { ...BASE_ALLOC, traditional401k: 50, traditionalIRA: 50 },
    });
    const r = allocateContributions(input);
    expect(r.contributions.traditional401k).toBeCloseTo(24500);
    expect(r.contributions.traditionalIRA).toBeCloseTo(7500);
    expect(r.spilloverToTaxable).toBeCloseTo(80000 - 24500 - 7500);
    expect(r.contributions.taxable).toBeCloseTo(80000 - 24500 - 7500);
  });

  // ── HSA limit ──
  it('HSA over $4,400 spills to taxable', () => {
    const input = makeInput({
      totalSavings: 10000,
      allocation: { ...BASE_ALLOC, hsa: 100 },
    });
    const r = allocateContributions(input);
    expect(r.contributions.hsa).toBeCloseTo(4400);
    expect(r.spilloverToTaxable).toBeCloseTo(5600);
  });

  // ── Catch-up contributions ──
  it('age 49, catch-up enabled → no extra', () => {
    const input = makeInput({
      totalSavings: 30000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      age: 49,
      enable401kCatchUp: true,
    });
    const r = allocateContributions(input);
    expect(r.contributions.traditional401k).toBeCloseTo(24500);
    expect(r.spilloverToTaxable).toBeCloseTo(5500);
  });

  it('age 50, catch-up enabled → limit = 32000', () => {
    const input = makeInput({
      totalSavings: 35000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      age: 50,
      enable401kCatchUp: true,
    });
    const r = allocateContributions(input);
    expect(r.contributions.traditional401k).toBeCloseTo(32000);
    expect(r.spilloverToTaxable).toBeCloseTo(3000);
  });

  it('age 50, catch-up DISABLED → limit stays 24500', () => {
    const input = makeInput({
      totalSavings: 30000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      age: 50,
      enable401kCatchUp: false,
    });
    const r = allocateContributions(input);
    expect(r.contributions.traditional401k).toBeCloseTo(24500);
  });

  it('IRA catch-up: age 50 enabled → limit = 8500', () => {
    const input = makeInput({
      totalSavings: 10000,
      allocation: { ...BASE_ALLOC, traditionalIRA: 100 },
      age: 50,
      enableIRACatchUp: true,
    });
    const r = allocateContributions(input);
    expect(r.contributions.traditionalIRA).toBeCloseTo(8500);
    expect(r.spilloverToTaxable).toBeCloseTo(1500);
  });

  // ── Conservation: total contributions = total savings ──
  it('total contributions always equals total savings', () => {
    const configs = [
      { totalSavings: 100000, allocation: { ...BASE_ALLOC, traditional401k: 40, rothIRA: 30, taxable: 20, hsa: 10 } },
      { totalSavings: 5000, allocation: { ...BASE_ALLOC, taxable: 100 } },
      { totalSavings: 50000, allocation: { ...BASE_ALLOC, traditional401k: 50, traditionalIRA: 50 } },
    ];
    for (const cfg of configs) {
      const r = allocateContributions(makeInput(cfg));
      const total = ACCOUNT_TYPES.reduce((s, a) => s + r.contributions[a], 0);
      expect(total).toBeCloseTo(cfg.totalSavings, 0);
    }
  });

  // ── Zero savings ──
  it('zero savings → zero everywhere', () => {
    const r = allocateContributions(makeInput({ totalSavings: 0 }));
    for (const acct of ACCOUNT_TYPES) {
      expect(r.contributions[acct]).toBe(0);
    }
    expect(r.spilloverToTaxable).toBe(0);
  });
});

describe('Employer match', () => {
  it('100% match up to 6% of salary → correct match amount in traditional 401k', () => {
    // Salary $100k, savings 10%, all to traditional 401k
    // Employee 401k = $10,000. Match = min($10k, $100k×6%) × 100% = $6,000
    const r = allocateContributions(makeInput({
      totalSavings: 10000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      employerMatch: 6000,  // pre-computed: min(10000, 100000*0.06) * 1.0
      employerRothPct: 0,
    }));
    expect(r.employerContributions.traditional401k).toBeCloseTo(6000);
    expect(r.employerContributions.roth401k).toBe(0);
  });

  it('employer match does NOT count toward employee 401k limit', () => {
    // Employee contributes $24,500 (at limit). Employer match = $10,000.
    // Employee should hit limit with no spillover. Employer adds on top.
    const r = allocateContributions(makeInput({
      totalSavings: 24500,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      employerMatch: 10000,
      employerRothPct: 0,
    }));
    expect(r.contributions.traditional401k).toBeCloseTo(24500);
    expect(r.spilloverToTaxable).toBe(0);
    expect(r.employerContributions.traditional401k).toBeCloseTo(10000);
  });

  it('employer match split: 40% Roth, 60% Traditional', () => {
    const r = allocateContributions(makeInput({
      totalSavings: 20000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      employerMatch: 8000,
      employerRothPct: 40,
    }));
    expect(r.employerContributions.roth401k).toBeCloseTo(3200);
    expect(r.employerContributions.traditional401k).toBeCloseTo(4800);
  });

  it('employer match 100% to Roth 401k', () => {
    const r = allocateContributions(makeInput({
      totalSavings: 15000,
      allocation: { ...BASE_ALLOC, roth401k: 100 },
      employerMatch: 5000,
      employerRothPct: 100,
    }));
    expect(r.employerContributions.roth401k).toBeCloseTo(5000);
    expect(r.employerContributions.traditional401k).toBe(0);
  });

  it('zero employer match → zero employer contributions', () => {
    const r = allocateContributions(makeInput({
      totalSavings: 20000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      employerMatch: 0,
      employerRothPct: 0,
    }));
    for (const acct of ACCOUNT_TYPES) {
      expect(r.employerContributions[acct]).toBe(0);
    }
  });

  it('employer match + employee spillover are independent', () => {
    // Employee wants $50k to 401k (limit $24,500), employer match = $12k
    // Employee: $24,500 to 401k + $25,500 spillover to taxable
    // Employer: $12,000 to traditional 401k (separate, unaffected)
    const r = allocateContributions(makeInput({
      totalSavings: 50000,
      allocation: { ...BASE_ALLOC, traditional401k: 100 },
      employerMatch: 12000,
      employerRothPct: 0,
    }));
    expect(r.contributions.traditional401k).toBeCloseTo(24500);
    expect(r.spilloverToTaxable).toBeCloseTo(25500);
    expect(r.contributions.taxable).toBeCloseTo(25500);
    expect(r.employerContributions.traditional401k).toBeCloseTo(12000);
  });
});
