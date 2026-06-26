import React from 'react';
import type { ResultsSectionId } from '../../navigation';

// NextStepCards — discoverability tiles shown on the Plan tab so first-time
// users see the other Results tabs exist. Safe to remove: delete this file
// and the <NextStepCards /> usage in Results/index.tsx.

interface NextStepCardsProps {
  setActiveTab: (id: ResultsSectionId) => void;
}

interface TileDef {
  id: ResultsSectionId;
  label: string;
  question: string;
  icon: React.ReactNode;
}

const TILES: TileDef[] = [
  {
    id: 'outcomes',
    label: 'Outcomes',
    question: 'How much could it vary, and when could it fail?',
    icon: <FanIcon />,
  },
  {
    id: 'cashflow',
    label: 'Cashflow',
    question: 'Where does money come from each year?',
    icon: <CashflowIcon />,
  },
  {
    id: 'taxes',
    label: 'Taxes',
    question: "What will you pay in taxes?",
    icon: <TaxIcon />,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    question: 'Which accounts get spent first?',
    icon: <AccountsIcon />,
  },
];

export function NextStepCards({ setActiveTab }: NextStepCardsProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Keep exploring
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TILES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className="text-left flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-sm transition group"
          >
            <span className="shrink-0 w-9 h-9 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
              {t.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t.label}
                </span>
                <ArrowIcon className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors shrink-0" />
              </span>
              <span className="block mt-0.5 text-xs text-gray-600 dark:text-gray-400 leading-snug">
                {t.question}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18 L9 13 L13 15 L21 6" />
      <path d="M3 21 L21 21" opacity="0.4" />
      <path d="M3 14 Q12 8 21 11" opacity="0.4" />
    </svg>
  );
}

function CashflowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="14" width="3" height="6" rx="0.5" />
      <rect x="9" y="10" width="3" height="10" rx="0.5" />
      <rect x="14" y="6" width="3" height="14" rx="0.5" />
      <rect x="19" y="11" width="3" height="9" rx="0.5" />
    </svg>
  );
}

function TaxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h14l-2 16H7L5 4z" />
      <path d="M9 10h6M9 14h6" />
    </svg>
  );
}

function AccountsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="2.5" />
      <path d="M4 6v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6" />
      <path d="M4 12v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6" />
    </svg>
  );
}

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
