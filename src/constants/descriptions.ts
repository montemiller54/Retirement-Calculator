import type { AccountType, WithdrawalStrategy } from '../types';

export const ACCOUNT_DESCRIPTIONS: Record<AccountType, string> = {
  traditional401k: 'Employer-sponsored retirement account. Contributions reduce your taxable income now, but withdrawals in retirement are taxed as ordinary income.',
  roth401k: 'Employer-sponsored retirement account funded with after-tax money. Withdrawals in retirement are completely tax-free.',
  traditionalIRA: 'Individual retirement account. Contributions may be tax-deductible. Withdrawals in retirement are taxed as ordinary income.',
  rothIRA: 'Individual retirement account funded with after-tax money. Withdrawals in retirement are completely tax-free, with no required minimum distributions.',
  taxable: 'A regular investment/brokerage account with no special tax benefits. You can withdraw any time without penalty, but gains are taxed.',
  hsa: 'Health Savings Account — a triple-tax-advantaged account for medical expenses. Contributions, growth, and qualified withdrawals are all tax-free.',
  cashAccount: 'Savings or checking accounts, CDs, or money market funds. Very low risk but also low returns.',
  otherAssets: 'Any other assets such as rental income, annuities, or business interests not captured elsewhere.',
};

export const WITHDRAWAL_STRATEGY_DESCRIPTIONS: Record<WithdrawalStrategy, string> = {
  taxEfficient: 'Spends taxable accounts first (already taxed), then tax-deferred accounts, then Roth accounts last — maximizing tax-free growth time.',
  rothPreserving: 'Similar to tax-efficient, but avoids touching Roth accounts to preserve their tax-free growth as long as possible.',
  proRata: 'Withdraws proportionally from all account types based on their current balances.',
};
