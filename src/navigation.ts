import { ProfileCard } from './components/Sidebar/ProfileCard';
import { EarningsCard } from './components/Sidebar/EarningsCard';
import { PortfolioInvestmentsCard } from './components/Sidebar/PortfolioInvestmentsCard';
import { SpendingHealthcareCard } from './components/Sidebar/SpendingHealthcareCard';
import { IncomeCard } from './components/Sidebar/IncomeCard';
import { WithdrawalStrategyCard } from './components/Sidebar/WithdrawalStrategyCard';
import type { CardProps } from './components/Sidebar/FieldError';
import type { ComponentType } from 'react';

export type ProfileSectionId =
  | 'profile' | 'earnings' | 'portfolio' | 'spending' | 'income' | 'withdrawal';

export interface ProfileSectionDef {
  id: ProfileSectionId;
  label: string;
  description: string;
  component: ComponentType<CardProps>;
}

export const PROFILE_SECTIONS: ProfileSectionDef[] = [
  { id: 'profile',    label: 'You & Spouse',           description: 'Basic info and retirement timeline.',           component: ProfileCard },
  { id: 'earnings',   label: 'Jobs & Savings',         description: 'Current jobs, salary, and retirement contributions.', component: EarningsCard },
  { id: 'portfolio',  label: 'Portfolio & Investments',description: 'Account balances and expected returns.',         component: PortfolioInvestmentsCard },
  { id: 'spending',   label: 'Spending & Healthcare',  description: 'Annual spending and healthcare assumptions.',    component: SpendingHealthcareCard },
  { id: 'income',     label: 'Retirement Income',      description: 'Social Security, pensions, and other income.',   component: IncomeCard },
  { id: 'withdrawal', label: 'Withdrawal Strategy',    description: 'How to draw down accounts in retirement.',       component: WithdrawalStrategyCard },
];

// Results tabs — one chart group per tab.
export type ResultsSectionId = 'plan' | 'outcomes' | 'cashflow' | 'taxes' | 'accounts';

export interface ResultsSectionDef {
  id: ResultsSectionId;
  label: string;
}

export const RESULTS_SECTIONS: ResultsSectionDef[] = [
  { id: 'plan',     label: 'Plan' },
  { id: 'outcomes', label: 'Outcomes' },
  { id: 'cashflow', label: 'Cashflow' },
  { id: 'taxes',    label: 'Taxes' },
  { id: 'accounts', label: 'Accounts' },
];

export type AppView =
  | { kind: 'profile'; sectionId: ProfileSectionId }
  | { kind: 'results'; sectionId: ResultsSectionId }
  | { kind: 'methodology' };

export function getProfileSectionIndex(id: ProfileSectionId): number {
  return PROFILE_SECTIONS.findIndex(s => s.id === id);
}

export function getAdjacentProfileSections(id: ProfileSectionId) {
  const i = getProfileSectionIndex(id);
  return {
    previous: i > 0 ? PROFILE_SECTIONS[i - 1] : undefined,
    next: i >= 0 && i < PROFILE_SECTIONS.length - 1 ? PROFILE_SECTIONS[i + 1] : undefined,
    isLast: i === PROFILE_SECTIONS.length - 1,
  };
}
