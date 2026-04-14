import type { AccountType, AccountBalances, WithdrawalStrategy } from '../types';
import { calculateRMD } from './rmd';

export interface WithdrawalInput {
  cashNeed: number;            // total cash needed this year (spending + estimated taxes)
  balances: AccountBalances;
  strategy: WithdrawalStrategy;
  age: number;
  priorYearTraditionalBalance: number; // for RMD calc (401k + IRA combined prior yr end)
  priorYear401kBalance: number;
  priorYearIRABalance: number;
  taxableCostBasisPct: number;  // current cost basis / balance ratio
}

export interface WithdrawalResult {
  withdrawals: AccountBalances;
  rmdAmount: number;
  capitalGains: number;  // realized from taxable
  excessRMD: number;     // RMD amount exceeding spending need (reinvested to taxable)
}

const PRE_TAX_ACCOUNTS: AccountType[] = ['traditional401k', 'traditionalIRA'];
const ROTH_ACCOUNTS: AccountType[] = ['roth401k', 'rothIRA'];

// Withdrawal order for each strategy
const STRATEGY_ORDER: Record<WithdrawalStrategy, AccountType[]> = {
  taxEfficient: ['cashAccount', 'otherAssets', 'taxable', 'hsa', 'traditional401k', 'traditionalIRA', 'roth401k', 'rothIRA'],
  rothPreserving: ['cashAccount', 'otherAssets', 'taxable', 'hsa', 'traditional401k', 'traditionalIRA', 'roth401k', 'rothIRA'],
  proRata: ['cashAccount', 'otherAssets', 'taxable', 'traditional401k', 'roth401k', 'traditionalIRA', 'rothIRA', 'hsa'],
};

export function executeWithdrawals(input: WithdrawalInput): WithdrawalResult {
  const {
    cashNeed, balances, strategy, age,
    priorYear401kBalance, priorYearIRABalance,
    taxableCostBasisPct,
  } = input;

  const withdrawals: AccountBalances = {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };

  // ── RMDs ──
  const rmd401k = calculateRMD(age, priorYear401kBalance);
  const rmdIRA = calculateRMD(age, priorYearIRABalance);
  const totalRMD = rmd401k + rmdIRA;

  // Force RMD withdrawals
  const actual401kRMD = Math.min(rmd401k, balances.traditional401k);
  const actualIRARMD = Math.min(rmdIRA, balances.traditionalIRA);
  withdrawals.traditional401k += actual401kRMD;
  withdrawals.traditionalIRA += actualIRARMD;

  const rmdWithdrawn = actual401kRMD + actualIRARMD;
  let remaining = Math.max(0, cashNeed - rmdWithdrawn);
  const excessRMD = Math.max(0, rmdWithdrawn - cashNeed);

  // ── Strategy-based withdrawals ──
  if (strategy === 'proRata') {
    // Withdraw proportionally from all accounts with balances
    const availableBalances: Partial<Record<AccountType, number>> = {};
    let totalAvailable = 0;
    for (const acct of STRATEGY_ORDER.proRata) {
      const avail = balances[acct] - withdrawals[acct];
      if (avail > 0) {
        availableBalances[acct] = avail;
        totalAvailable += avail;
      }
    }
    if (totalAvailable > 0 && remaining > 0) {
      const fraction = Math.min(1, remaining / totalAvailable);
      for (const [acct, avail] of Object.entries(availableBalances)) {
        const w = avail! * fraction;
        withdrawals[acct as AccountType] += w;
        remaining -= w;
      }
    }
  } else {
    // Sequential withdrawal
    const order = strategy === 'rothPreserving'
      ? ['cashAccount', 'otherAssets', 'taxable', 'hsa', 'traditional401k', 'traditionalIRA', 'roth401k', 'rothIRA'] as AccountType[]
      : STRATEGY_ORDER.taxEfficient;

    for (const acct of order) {
      if (remaining <= 0) break;
      const available = balances[acct] - withdrawals[acct];
      if (available <= 0) continue;
      const w = Math.min(remaining, available);
      withdrawals[acct] += w;
      remaining -= w;
    }
  }

  // Calculate capital gains from taxable withdrawals
  const capitalGains = withdrawals.taxable * (1 - taxableCostBasisPct);

  return {
    withdrawals,
    rmdAmount: totalRMD,
    capitalGains: Math.max(0, capitalGains),
    excessRMD,
  };
}
