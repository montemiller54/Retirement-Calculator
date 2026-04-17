import React, { useState } from 'react';
import { ProfileCard } from './ProfileCard';
import { EarningsCard } from './EarningsCard';
import { PortfolioInvestmentsCard } from './PortfolioInvestmentsCard';
import { SpendingHealthcareCard } from './SpendingHealthcareCard';
import { IncomeCard } from './IncomeCard';
import { WithdrawalStrategyCard } from './WithdrawalStrategyCard';
import type { ValidationError } from '../../utils/validation';
import { hasFieldError } from '../../utils/validation';
import { useScenario } from '../../context/ScenarioContext';

const ALL_SECTIONS = [
  { id: 'profile', label: 'You & Spouse', component: ProfileCard, showWhenRetired: true },
  { id: 'earnings', label: 'Earnings & Savings', component: EarningsCard, showWhenRetired: false },
  { id: 'portfolio', label: 'Portfolio & Investments', component: PortfolioInvestmentsCard, showWhenRetired: true },
  { id: 'spending', label: 'Spending & Healthcare', component: SpendingHealthcareCard, showWhenRetired: true },
  { id: 'income', label: 'Retirement Income', component: IncomeCard, showWhenRetired: true },
  { id: 'withdrawal', label: 'Withdrawal Strategy', component: WithdrawalStrategyCard, showWhenRetired: true },
] as const;

interface SidebarProps {
  validationErrors: ValidationError[];
}

export function Sidebar({ validationErrors }: SidebarProps) {
  const { scenario } = useScenario();
  const [activeSection, setActiveSection] = useState<string>('profile');
  const isRetired = scenario.currentAge >= scenario.retirementAge;

  const sections = ALL_SECTIONS.filter(s => !isRetired || s.showWhenRetired);

  // If active section was hidden, reset to first available
  const activeItem = sections.find(s => s.id === activeSection) ?? sections[0];
  const ActiveComponent = activeItem.component;
  const activeErrors = validationErrors.filter(e => e.card === activeItem.id);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Card title strip */}
      <nav className="w-40 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-y-auto">
        <div className="py-2">
          {sections.map(({ id, label }) => {
            const cardErrors = validationErrors.filter(e => e.card === id);
            const hasErrors = cardErrors.length > 0;
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-gray-900 text-primary-700 dark:text-primary-300 font-medium border-r-2 border-primary-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                onClick={() => setActiveSection(id)}
              >
                <span className="flex items-center gap-1.5">
                  {label}
                  {hasErrors && (
                    <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
                      {cardErrors.length}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Active card content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <ActiveComponent validationErrors={activeErrors} />
        </div>
      </div>
    </div>
  );
}
