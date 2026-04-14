import React, { useState } from 'react';
import { ProfileCard } from './ProfileCard';
import { EarningsCard } from './EarningsCard';
import { PortfolioInvestmentsCard } from './PortfolioInvestmentsCard';
import { SpendingHealthcareCard } from './SpendingHealthcareCard';
import { IncomeCard } from './IncomeCard';
import { WithdrawalStrategyCard } from './WithdrawalStrategyCard';
import type { ValidationError } from '../../utils/validation';
import { hasFieldError } from '../../utils/validation';

const SECTIONS = [
  { id: 'profile', label: 'You & Spouse', component: ProfileCard },
  { id: 'earnings', label: 'Earnings & Savings', component: EarningsCard },
  { id: 'portfolio', label: 'Portfolio & Investments', component: PortfolioInvestmentsCard },
  { id: 'spending', label: 'Spending & Healthcare', component: SpendingHealthcareCard },
  { id: 'income', label: 'Retirement Income', component: IncomeCard },
  { id: 'withdrawal', label: 'Withdrawal Strategy', component: WithdrawalStrategyCard },
] as const;

interface SidebarProps {
  validationErrors: ValidationError[];
}

export function Sidebar({ validationErrors }: SidebarProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['profile', 'earnings', 'portfolio']),
  );

  const toggle = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-1">
        {SECTIONS.map(({ id, label, component: Component }) => {
          const cardErrors = validationErrors.filter(e => e.card === id);
          const hasErrors = cardErrors.length > 0;
          return (
            <div key={id} className={`border rounded-lg overflow-hidden ${hasErrors ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`}>
              <button
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => toggle(id)}
              >
                <span className="flex items-center gap-2">
                  {label}
                  {hasErrors && (
                    <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
                      {cardErrors.length}
                    </span>
                  )}
                </span>
                <span className="text-gray-400">{openSections.has(id) ? '▾' : '▸'}</span>
              </button>
              {openSections.has(id) && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                  <Component validationErrors={cardErrors} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
