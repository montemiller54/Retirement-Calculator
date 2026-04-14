import { describe, it, expect } from 'vitest';
import { calculateRMD } from '../engine/rmd';
import { executeWithdrawals, type WithdrawalInput } from '../engine/withdrawals';
import { UNIFORM_LIFETIME_TABLE, RMD_START_AGE } from '../constants/rmd-table';
import { ACCOUNT_TYPES } from '../types';

// ───── RMD CALCULATIONS ─────

describe('RMD comprehensive', () => {
  it('age 72 → $0 RMD', () => {
    expect(calculateRMD(72, 1_000_000)).toBe(0);
  });

  it('age 73 → balance / 26.5', () => {
    expect(calculateRMD(73, 1_000_000)).toBeCloseTo(1_000_000 / 26.5, 2);
  });

  it('age 80 → balance / 20.2', () => {
    expect(calculateRMD(80, 500_000)).toBeCloseTo(500_000 / 20.2, 2);
  });

  it('age 90 → balance / 12.2', () => {
    expect(calculateRMD(90, 300_000)).toBeCloseTo(300_000 / 12.2, 2);
  });

  it('age 100 → balance / 6.4', () => {
    expect(calculateRMD(100, 200_000)).toBeCloseTo(200_000 / 6.4, 2);
  });

  it('age beyond table (125) → uses age 120 divisor (2.0)', () => {
    expect(calculateRMD(125, 100_000)).toBeCloseTo(100_000 / 2.0, 2);
  });

  it('zero balance → $0 regardless of age', () => {
    expect(calculateRMD(80, 0)).toBe(0);
  });

  it('negative balance → $0', () => {
    expect(calculateRMD(80, -5000)).toBe(0);
  });

  it('RMD increases as percentage of balance with age', () => {
    const bal = 1_000_000;
    const rmd73 = calculateRMD(73, bal);
    const rmd80 = calculateRMD(80, bal);
    const rmd90 = calculateRMD(90, bal);
    expect(rmd80).toBeGreaterThan(rmd73);
    expect(rmd90).toBeGreaterThan(rmd80);
  });

  it('all table ages produce valid positive RMD', () => {
    for (let age = RMD_START_AGE; age <= 120; age++) {
      const rmd = calculateRMD(age, 1_000_000);
      expect(rmd).toBeGreaterThan(0);
      expect(rmd).toBeLessThanOrEqual(1_000_000);
    }
  });
});

// ───── WITHDRAWAL STRATEGY TESTS ─────

function makeWithdrawalInput(overrides: Partial<WithdrawalInput>): WithdrawalInput {
  return {
    cashNeed: 50000,
    balances: {
      traditional401k: 500_000, roth401k: 0, traditionalIRA: 200_000,
      rothIRA: 100_000, taxable: 300_000, hsa: 10_000,
      cashAccount: 0, otherAssets: 0,
    },
    strategy: 'taxEfficient',
    age: 65,
    priorYearTraditionalBalance: 700_000,
    priorYear401kBalance: 500_000,
    priorYearIRABalance: 200_000,
    taxableCostBasisPct: 0.7,
    ...overrides,
  };
}

describe('Withdrawal strategies — comprehensive', () => {

  // ── Tax-efficient order: taxable → HSA → trad401k → tradIRA → roth401k → rothIRA ──
  it('tax-efficient: draws taxable first when sufficient', () => {
    const r = executeWithdrawals(makeWithdrawalInput({ cashNeed: 50000 }));
    expect(r.withdrawals.taxable).toBe(50000);
    expect(r.withdrawals.traditional401k).toBe(0);
    expect(r.withdrawals.rothIRA).toBe(0);
  });

  it('tax-efficient: taxable exhausted, moves to HSA then traditional', () => {
    const input = makeWithdrawalInput({
      cashNeed: 320000, // 300K taxable + 10K HSA + 10K from traditional
      balances: {
        traditional401k: 500_000, roth401k: 0, traditionalIRA: 200_000,
        rothIRA: 100_000, taxable: 300_000, hsa: 10_000,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const r = executeWithdrawals(input);
    expect(r.withdrawals.taxable).toBe(300_000);
    expect(r.withdrawals.hsa).toBe(10_000);
    expect(r.withdrawals.traditional401k).toBe(10_000);
    expect(r.withdrawals.rothIRA).toBe(0);
  });

  it('tax-efficient: draws roth last', () => {
    const input = makeWithdrawalInput({
      cashNeed: 1_200_000, // needs everything
      balances: {
        traditional401k: 500_000, roth401k: 0, traditionalIRA: 200_000,
        rothIRA: 100_000, taxable: 300_000, hsa: 10_000,
        cashAccount: 0, otherAssets: 0,
      },
    });
    const r = executeWithdrawals(input);
    // Everything should be withdrawn
    expect(r.withdrawals.taxable).toBe(300_000);
    expect(r.withdrawals.traditional401k).toBe(500_000);
    expect(r.withdrawals.traditionalIRA).toBe(200_000);
    expect(r.withdrawals.rothIRA).toBe(100_000);
    expect(r.withdrawals.hsa).toBe(10_000);
  });

  // ── Pro-rata ──
  it('pro-rata: proportional to balance', () => {
    const balances = {
      traditional401k: 400_000, roth401k: 0, traditionalIRA: 0,
      rothIRA: 100_000, taxable: 500_000, hsa: 0,
      cashAccount: 0, otherAssets: 0,
    };
    const input = makeWithdrawalInput({
      strategy: 'proRata', cashNeed: 100_000, balances,
    });
    const r = executeWithdrawals(input);
    const total = 1_000_000;
    expect(r.withdrawals.traditional401k).toBeCloseTo(400_000 * (100_000 / total), 0);
    expect(r.withdrawals.rothIRA).toBeCloseTo(100_000 * (100_000 / total), 0);
    expect(r.withdrawals.taxable).toBeCloseTo(500_000 * (100_000 / total), 0);
  });

  // ── RMD forcing ──
  it('RMD forced at 73 even when spending < RMD', () => {
    const input = makeWithdrawalInput({
      cashNeed: 5000, // very small
      age: 73,
      priorYear401kBalance: 500_000,
      priorYearIRABalance: 200_000,
    });
    const r = executeWithdrawals(input);
    const expectedRMD = 500_000 / 26.5 + 200_000 / 26.5;
    expect(r.rmdAmount).toBeCloseTo(expectedRMD, 0);
    // RMD exceeds cash need → excess
    expect(r.excessRMD).toBeGreaterThan(0);
  });

  it('RMD: excess routes to taxable reinvestment', () => {
    const input = makeWithdrawalInput({
      cashNeed: 1000,
      age: 75,
      priorYear401kBalance: 1_000_000,
      priorYearIRABalance: 0,
    });
    const r = executeWithdrawals(input);
    // RMD at 75 = 1M / 24.6 ≈ 40650
    expect(r.excessRMD).toBeCloseTo(1_000_000 / 24.6 - 1000, -1);
  });

  // ── Capital gains ──
  it('capital gains: 80% basis → 20% of taxable withdrawal is gain', () => {
    const input = makeWithdrawalInput({ cashNeed: 100_000, taxableCostBasisPct: 0.8 });
    const r = executeWithdrawals(input);
    expect(r.capitalGains).toBeCloseTo(100_000 * 0.2, 0);
  });

  it('capital gains: 100% basis → 0 gains', () => {
    const input = makeWithdrawalInput({ cashNeed: 50_000, taxableCostBasisPct: 1.0 });
    const r = executeWithdrawals(input);
    expect(r.capitalGains).toBe(0);
  });

  it('capital gains: 0% basis → 100% gains', () => {
    const input = makeWithdrawalInput({ cashNeed: 50_000, taxableCostBasisPct: 0.0 });
    const r = executeWithdrawals(input);
    expect(r.capitalGains).toBeCloseTo(50_000, 0);
  });

  // ── Depletion handling ──
  it('cash need exceeds total balance → withdraws all, no negative balances', () => {
    const input = makeWithdrawalInput({ cashNeed: 5_000_000 });
    const r = executeWithdrawals(input);
    const totalWithdrawn = ACCOUNT_TYPES.reduce((s, a) => s + r.withdrawals[a], 0);
    const totalBalance = ACCOUNT_TYPES.reduce((s, a) => s + input.balances[a], 0);
    expect(totalWithdrawn).toBeCloseTo(totalBalance, 0);
  });

  it('all accounts empty → zero withdrawals', () => {
    const input = makeWithdrawalInput({
      cashNeed: 50_000,
      balances: { traditional401k: 0, roth401k: 0, traditionalIRA: 0, rothIRA: 0, taxable: 0, hsa: 0, cashAccount: 0, otherAssets: 0 },
    });
    const r = executeWithdrawals(input);
    for (const acct of ACCOUNT_TYPES) {
      expect(r.withdrawals[acct]).toBe(0);
    }
  });

  // ── Withdrawal conservation: total withdrawn ≤ total balance ──
  it('withdrawals never exceed available balance', () => {
    const scenarios: Partial<WithdrawalInput>[] = [
      { cashNeed: 50_000 },
      { cashNeed: 500_000 },
      { cashNeed: 2_000_000 },
      { cashNeed: 100_000, strategy: 'proRata' },
      { cashNeed: 100_000, strategy: 'rothPreserving' },
    ];
    for (const overrides of scenarios) {
      const input = makeWithdrawalInput(overrides);
      const r = executeWithdrawals(input);
      for (const acct of ACCOUNT_TYPES) {
        expect(r.withdrawals[acct]).toBeLessThanOrEqual(input.balances[acct] + 0.01);
        expect(r.withdrawals[acct]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
