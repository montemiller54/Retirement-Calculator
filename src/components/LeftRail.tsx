import React, { useState } from 'react';
import type { ValidationError } from '../utils/validation';
import type { AppView, ProfileSectionId } from '../navigation';
import { PROFILE_SECTIONS } from '../navigation';

interface LeftRailProps {
  view: AppView;
  setView: (v: AppView) => void;
  validationErrors: ValidationError[];
  onRun: () => void;
  isRunning: boolean;
  progress: number;
  hasResults: boolean;
}

export function LeftRail({
  view, setView, validationErrors, onRun, isRunning, progress, hasResults,
}: LeftRailProps) {
  const [profileOpen, setProfileOpen] = useState(true);

  return (
    <aside className="w-[15rem] shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      <nav className="flex-1 overflow-y-auto py-2 text-[0.8125rem]">
        <GroupHeader
          label="Profile"
          open={profileOpen}
          onToggle={() => setProfileOpen(o => !o)}
        />
        {profileOpen && (
          <ul className="mb-2">
            {PROFILE_SECTIONS.map(({ id, label }) => {
              const errs = validationErrors.filter(e => e.card === id).length;
              const active = view.kind === 'profile' && view.sectionId === id;
              return (
                <li key={id}>
                  <RailButton
                    label={label}
                    active={active}
                    badge={errs > 0 ? errs : undefined}
                    badgeKind="error"
                    onClick={() => setView({ kind: 'profile', sectionId: id as ProfileSectionId })}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 px-3 pt-2 border-t border-gray-200 dark:border-gray-800">
          <RailButton
            label="Results"
            active={view.kind === 'results'}
            disabled={!hasResults}
            onClick={() => setView({ kind: 'results', sectionId: 'plan' })}
          />
        </div>

        <div className="mt-1 px-3 py-2">
          <button
            className="btn-cta btn-cta--compact"
            onClick={onRun}
            disabled={isRunning || validationErrors.length > 0}
            title={validationErrors.length > 0 ? 'Fix validation errors first' : undefined}
          >
            {isRunning ? `Running ${progress}%` : 'Run Simulation'}
          </button>
        </div>

        <div className="mt-1 px-3 pt-2 border-t border-gray-200 dark:border-gray-800">
          <RailButton
            label="Methodology"
            compact
            active={view.kind === 'methodology'}
            onClick={() => setView({ kind: 'methodology' })}
          />
        </div>
      </nav>
    </aside>
  );
}

function GroupHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-1.5 text-[0.625rem] font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      aria-expanded={open}
    >
      <span>{label}</span>
      <Chevron open={open} />
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

interface RailButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  badgeKind?: 'error';
  compact?: boolean;
  onClick: () => void;
}

function RailButton({ label, active, disabled, badge, badgeKind, compact, onClick }: RailButtonProps) {
  const base = compact
    ? 'w-full text-left px-1 py-1.5 text-[0.75rem] rounded transition-colors'
    : 'relative w-full text-left pl-5 pr-3 py-1.5 transition-colors';
  const stateClasses = disabled
    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
    : active
    ? compact
      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
      // Active rail item adopts the canvas background and the right border is
      // "erased" with a negative margin so it visually merges into the content
      // surface. A subtle 2px primary-tinted bar on the left signals "you are
      // here" without shouting.
      : 'bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-medium -mr-px before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-primary-400 dark:before:bg-primary-500'
    : compact
      ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${base} ${stateClasses}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {badge !== undefined && (
          <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[0.625rem] font-bold text-white rounded-full ${
            badgeKind === 'error' ? 'bg-red-500' : 'bg-gray-400'
          }`}>
            {badge}
          </span>
        )}
      </span>
    </button>
  );
}
