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
  /** RMD start age (73 or 75 per SECURE 2.0); defaults to 73 when omitted. */
  rmdStartAge?: number;
  /**
   * Gross traditional-account withdrawal (RMDs + voluntary) that keeps total
   * ordinary income at or below the target bracket ceiling for the year
   * (e.g. top of the 12% bracket + standard deduction, minus already-known
   * ordinary income like wages, pension, taxable SS, and Roth conversions).
   *
   * Only used by the 'taxEfficient' strategy. When undefined, taxEfficient
   * falls back to the legacy fixed order (taxable → traditional → Roth).
   */
  traditionalBracketFillLimit?: number;
}

export interface WithdrawalResult {
  withdrawals: AccountBalances;
  rmdAmount: number;
  capitalGains: number;  // realized from taxable
  excessRMD: number;     // RMD amount exceeding spending need (reinvested to taxable)
}

// Withdrawal order for each strategy.
// HSA is intentionally excluded: it is reserved for qualified medical expenses
// and is consumed by the healthcare-cost block in simulation.ts, not by general spending.
const STRATEGY_ORDER: Record<WithdrawalStrategy, AccountType[]> = {
  // Conventional "tax-efficient" order: spend the lightest-taxed dollars first,
  // spreading ordinary income across many years. Taxable (LTCG-taxed gains) → Traditional
  // (ordinary income) → Roth (tax-free, preserved for last).
  taxEfficient:   ['cashAccount', 'otherAssets', 'taxable', 'traditional401k', 'traditionalIRA', 'roth401k', 'rothIRA'],
  // "Roth-preserving" / reverse-conventional: drain traditional first to shrink
  // future RMDs and let Roth compound tax-free for as many years as possible.
  // Trade-off: higher ordinary-income taxes in early retirement.
  rothPreserving: ['cashAccount', 'otherAssets', 'traditional401k', 'traditionalIRA', 'taxable', 'roth401k', 'rothIRA'],
  proRata:        ['cashAccount', 'otherAssets', 'taxable', 'traditional401k', 'roth401k', 'traditionalIRA', 'rothIRA'],
};

export function executeWithdrawals(input: WithdrawalInput): WithdrawalResult {
  const {
    cashNeed, balances, strategy, age,
    priorYear401kBalance, priorYearIRABalance,
    taxableCostBasisPct, rmdStartAge,
  } = input;

  const withdrawals: AccountBalances = {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };

  // ── RMDs ──
  const rmd401k = calculateRMD(age, priorYear401kBalance, rmdStartAge);
  const rmdIRA = calculateRMD(age, priorYearIRABalance, rmdStartAge);
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
    const accts = STRATEGY_ORDER.proRata;
    const availableBalances: Partial<Record<AccountType, number>> = {};
    let totalAvailable = 0;
    for (const acct of accts) {
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
  } else if (strategy === 'taxEfficient' && input.traditionalBracketFillLimit !== undefined) {
    // Bracket-aware tax-efficient withdrawal (Kitces-style bracket management):
    //   1. cash & other assets first (effectively tax-free)
    //   2. traditional up to the bracket-fill limit (fills low bracket with ordinary income)
    //   3. taxable brokerage (LTCG, often at 0% or 15%)
    //   4. more traditional (accepts higher bracket only after taxable is exhausted)
    //   5. Roth 401k → Roth IRA (last resort — protects tax-free growth)
    //
    // The limit is the TOTAL traditional withdrawal that fits in the target
    // bracket (RMDs count toward it), so we deduct RMDs already withdrawn.
    const rmdAlreadyTaken = withdrawals.traditional401k + withdrawals.traditionalIRA;
    let bracketBudget = Math.max(0, input.traditionalBracketFillLimit - rmdAlreadyTaken);

    // Phase 1: cash / other assets
    for (const acct of ['cashAccount', 'otherAssets'] as AccountType[]) {
      if (remaining <= 0) break;
      const available = balances[acct] - withdrawals[acct];
      if (available <= 0) continue;
      const w = Math.min(remaining, available);
      withdrawals[acct] += w;
      remaining -= w;
    }

    // Phase 2: traditional up to bracket cap
    for (const acct of ['traditional401k', 'traditionalIRA'] as AccountType[]) {
      if (remaining <= 0 || bracketBudget <= 0) break;
      const available = balances[acct] - withdrawals[acct];
      if (available <= 0) continue;
      const w = Math.min(remaining, available, bracketBudget);
      withdrawals[acct] += w;
      remaining -= w;
      bracketBudget -= w;
    }

    // Phases 3–5: taxable → more traditional (over-bracket) → Roth
    const fallThrough: AccountType[] = [
      'taxable',
      'traditional401k', 'traditionalIRA',
      'roth401k', 'rothIRA',
    ];
    for (const acct of fallThrough) {
      if (remaining <= 0) break;
      const available = balances[acct] - withdrawals[acct];
      if (available <= 0) continue;
      const w = Math.min(remaining, available);
      withdrawals[acct] += w;
      remaining -= w;
    }
  } else {
    // Sequential withdrawal
    const order = STRATEGY_ORDER[strategy];

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
