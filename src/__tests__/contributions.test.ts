import { describe, it, expect } from 'vitest';
import { allocateContributions, type ContributionInput } from '../engine/contributions';

describe('allocateContributions', () => {
  const baseInput: ContributionInput = {
    totalSavings: 30000,
    allocation: {
      traditional401k: 50,
      roth401k: 0,
      traditionalIRA: 20,
      rothIRA: 0,
      taxable: 30,
      hsa: 0,
      cashAccount: 0, otherAssets: 0,
    },
    age: 35,
    limit401k: 24500,
    limitIRA: 7500,
    enable401kCatchUp: false,
    enableIRACatchUp: false,
    employerMatch: 0,
    employerRothPct: 0,
  };

  it('allocates within limits', () => {
    const result = allocateContributions(baseInput);
    // 50% of 30000 = 15000 to 401k (under 24500)
    // 20% of 30000 = 6000 to traditional IRA (under 7500)
    // 30% of 30000 = 9000 to taxable
    expect(result.contributions.traditional401k).toBeCloseTo(15000);
    expect(result.contributions.traditionalIRA).toBeCloseTo(6000);
    expect(result.contributions.taxable).toBeCloseTo(9000);
    expect(result.spilloverToTaxable).toBe(0);
  });

  it('enforces 401k limit and spills to taxable', () => {
    const input: ContributionInput = {
      ...baseInput,
      totalSavings: 60000,
      allocation: {
        traditional401k: 80,
        roth401k: 0,
        traditionalIRA: 0,
        rothIRA: 0,
        taxable: 20,
        hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    };
    const result = allocateContributions(input);
    // 80% of 60000 = 48000, but limit is 24500
    expect(result.contributions.traditional401k).toBeCloseTo(24500);
    expect(result.spilloverToTaxable).toBeCloseTo(48000 - 24500);
    // Taxable = 20% * 60000 + spillover
    expect(result.contributions.taxable).toBeCloseTo(12000 + 23500);
  });

  it('enforces IRA limit and spills to taxable', () => {
    const input: ContributionInput = {
      ...baseInput,
      totalSavings: 50000,
      allocation: {
        traditional401k: 0,
        roth401k: 0,
        traditionalIRA: 50,
        rothIRA: 50,
        taxable: 0,
        hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
    };
    const result = allocateContributions(input);
    // Combined IRA = 50000. Limit = 7500. Excess = 42500.
    const totalIRA = result.contributions.traditionalIRA + result.contributions.rothIRA;
    expect(totalIRA).toBeCloseTo(7500);
    expect(result.spilloverToTaxable).toBeCloseTo(42500);
  });

  it('applies catch-up when eligible and enabled', () => {
    const input: ContributionInput = {
      ...baseInput,
      totalSavings: 35000,
      allocation: {
        traditional401k: 100,
        roth401k: 0,
        traditionalIRA: 0,
        rothIRA: 0,
        taxable: 0,
        hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      age: 55,
      enable401kCatchUp: true,
    };
    const result = allocateContributions(input);
    // Limit = 24500 + 7500 = 32000
    expect(result.contributions.traditional401k).toBeCloseTo(32000);
    expect(result.spilloverToTaxable).toBeCloseTo(3000);
  });
});
