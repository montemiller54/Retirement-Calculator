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
    const totalBal = 500000 + 200000 + 100000 + 300000 + 10000;
    const frac = 50000 / totalBal;
    // Each account should withdraw proportionally
    expect(result.withdrawals.taxable).toBeCloseTo(300000 * frac, 0);
    expect(result.withdrawals.traditional401k).toBeCloseTo(500000 * frac, 0);
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
    // Should withdraw everything available
    const totalWithdrawn = Object.values(result.withdrawals).reduce((a, b) => a + b, 0);
    const totalBalance = Object.values(input.balances).reduce((a, b) => a + b, 0);
    expect(totalWithdrawn).toBeCloseTo(totalBalance, 0);
  });
});
