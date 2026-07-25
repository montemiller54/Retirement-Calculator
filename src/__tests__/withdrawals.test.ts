import { describe, it, expect } from 'vitest';
import { executeWithdrawals, type WithdrawalInput } from '../engine/withdrawals';

describe('executeWithdrawals', () => {
  const baseInput: WithdrawalInput = {
    cashNeed: 50000,
    balances: {
      traditional401k: 500000,
      roth401k: 0,
      traditionalIRA: 200000,
      rothIRA: 100000,
      taxable: 300000,
      hsa: 10000,
      cashAccount: 0, otherAssets: 0,
    },
    strategy: 'taxEfficient',
    age: 70,
    priorYearTraditionalBalance: 700000,
    priorYear401kBalance: 500000,
    priorYearIRABalance: 200000,
    taxableCostBasisPct: 0.7,
  };

  it('withdraws from taxable first in tax-efficient strategy', () => {
    const result = executeWithdrawals(baseInput);
    // No RMDs at age 70 (starts at 73)
    expect(result.rmdAmount).toBe(0);
    // Should withdraw from taxable first
    expect(result.withdrawals.taxable).toBe(50000);
    expect(result.withdrawals.traditional401k).toBe(0);
  });

  it('forces RMDs at age 73+', () => {
    const input: WithdrawalInput = {
      ...baseInput,
      age: 73,
    };
    const result = executeWithdrawals(input);
    // RMD = 500000/26.5 + 200000/26.5 ≈ 26415
    expect(result.rmdAmount).toBeCloseTo(700000 / 26.5, 0);
  });

  it('withdraws proportionally in pro-rata strategy', () => {
    const input: WithdrawalInput = {
      ...baseInput,
      strategy: 'proRata',
      age: 65, // no RMDs
    };
    const result = executeWithdrawals(input);
    // HSA is excluded (reserved for medical); pro-rata divides across remaining accounts
    const totalBal = 500000 + 200000 + 100000 + 300000;
    const frac = 50000 / totalBal;
    // Each account should withdraw proportionally
    expect(result.withdrawals.taxable).toBeCloseTo(300000 * frac, 0);
    expect(result.withdrawals.traditional401k).toBeCloseTo(500000 * frac, 0);
    expect(result.withdrawals.hsa).toBe(0);
  });

  it('calculates capital gains from taxable withdrawals', () => {
    const result = executeWithdrawals(baseInput);
    // Withdrawing 50000 from taxable, 70% is basis, 30% is gains
    expect(result.capitalGains).toBeCloseTo(50000 * 0.3, 0);
  });

  it('handles insufficient balances gracefully', () => {
    const input: WithdrawalInput = {
      ...baseInput,
      cashNeed: 2000000, // more than total balance
      age: 65,
    };
    const result = executeWithdrawals(input);
    // Should withdraw everything available EXCEPT HSA (reserved for medical)
    const totalWithdrawn = Object.values(result.withdrawals).reduce((a, b) => a + b, 0);
    const totalBalance = Object.values(input.balances).reduce((a, b) => a + b, 0);
    expect(totalWithdrawn).toBeCloseTo(totalBalance - input.balances.hsa, 0);
    expect(result.withdrawals.hsa).toBe(0);
  });

  // Engine-level distinctness: each of the three strategies must produce a
  // different per-account withdrawal pattern for a mixed portfolio. Catches the
  // bug where two strategies share the same account order table.
  it('taxEfficient, rothPreserving, and proRata each produce a distinct withdrawal pattern', () => {
    const mixedInput: WithdrawalInput = {
      cashNeed: 80_000,
      balances: {
        traditional401k: 300_000, roth401k: 0,
        traditionalIRA: 100_000, rothIRA: 200_000,
        taxable: 150_000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      strategy: 'taxEfficient',
      age: 65, // no RMDs
      priorYearTraditionalBalance: 400_000,
      priorYear401kBalance: 300_000,
      priorYearIRABalance: 100_000,
      taxableCostBasisPct: 0.7,
    };

    const strategies = ['taxEfficient', 'rothPreserving', 'proRata'] as const;
    const patterns = strategies.map(strategy => ({
      strategy,
      withdrawals: executeWithdrawals({ ...mixedInput, strategy }).withdrawals,
    }));

    const signature = (w: typeof patterns[number]['withdrawals']) =>
      [w.taxable, w.traditional401k, w.traditionalIRA, w.rothIRA, w.roth401k]
        .map(v => v.toFixed(2))
        .join('|');

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        expect(
          signature(patterns[i].withdrawals),
          `${patterns[i].strategy} and ${patterns[j].strategy} produced identical per-account withdrawals — strategy tables may be duplicated`,
        ).not.toBe(signature(patterns[j].withdrawals));
      }
    }
  });

  // Bracket-fill behavior: when the caller supplies `traditionalBracketFillLimit`,
  // tax-efficient should draw traditional up to the cap first, then fall through
  // to taxable, then more traditional, then Roth.
  it('taxEfficient bracket-fill: caps traditional draw at limit, then falls through to taxable', () => {
    const input: WithdrawalInput = {
      cashNeed: 90_000,
      balances: {
        traditional401k: 500_000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 100_000,
        taxable: 200_000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      strategy: 'taxEfficient',
      age: 65,
      priorYearTraditionalBalance: 500_000,
      priorYear401kBalance: 500_000,
      priorYearIRABalance: 0,
      taxableCostBasisPct: 1.0, // no cap gains for clarity
      traditionalBracketFillLimit: 40_000,
    };
    const r = executeWithdrawals(input);
    // Traditional should be exactly the limit (40k); the remaining 50k comes from taxable.
    expect(r.withdrawals.traditional401k).toBeCloseTo(40_000, 2);
    expect(r.withdrawals.taxable).toBeCloseTo(50_000, 2);
    expect(r.withdrawals.rothIRA).toBe(0);
  });

  it('taxEfficient bracket-fill: exhausts taxable before returning to traditional above the bracket', () => {
    // Big cash need, small bracket room, small taxable balance → must spill
    // past the bracket back into traditional before touching Roth.
    const input: WithdrawalInput = {
      cashNeed: 200_000,
      balances: {
        traditional401k: 500_000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 100_000,
        taxable: 50_000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      strategy: 'taxEfficient',
      age: 65,
      priorYearTraditionalBalance: 500_000,
      priorYear401kBalance: 500_000,
      priorYearIRABalance: 0,
      taxableCostBasisPct: 1.0,
      traditionalBracketFillLimit: 40_000,
    };
    const r = executeWithdrawals(input);
    // Expected: 40k trad (in-bracket) + 50k taxable + 110k trad (over-bracket) = 200k
    expect(r.withdrawals.traditional401k).toBeCloseTo(150_000, 2); // 40k + 110k
    expect(r.withdrawals.taxable).toBeCloseTo(50_000, 2);
    expect(r.withdrawals.rothIRA).toBe(0); // Roth untouched
  });

  it('taxEfficient bracket-fill: with limit=0 (bracket already full), skips straight to taxable', () => {
    const input: WithdrawalInput = {
      cashNeed: 60_000,
      balances: {
        traditional401k: 500_000, roth401k: 0,
        traditionalIRA: 0, rothIRA: 100_000,
        taxable: 200_000, hsa: 0,
        cashAccount: 0, otherAssets: 0,
      },
      strategy: 'taxEfficient',
      age: 65,
      priorYearTraditionalBalance: 500_000,
      priorYear401kBalance: 500_000,
      priorYearIRABalance: 0,
      taxableCostBasisPct: 1.0,
      traditionalBracketFillLimit: 0,
    };
    const r = executeWithdrawals(input);
    expect(r.withdrawals.traditional401k).toBe(0);
    expect(r.withdrawals.taxable).toBeCloseTo(60_000, 2);
  });
});
