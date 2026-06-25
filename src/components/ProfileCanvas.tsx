import React from 'react';
import {
  PROFILE_SECTIONS,
  getAdjacentProfileSections,
  type ProfileSectionId,
  type AppView,
} from '../navigation';
import type { ValidationError } from '../utils/validation';

interface ProfileCanvasProps {
  sectionId: ProfileSectionId;
  validationErrors: ValidationError[];
  setView: (v: AppView) => void;
  onRun: () => void;
  isRunning: boolean;
}

export function ProfileCanvas({ sectionId, validationErrors, setView, onRun, isRunning }: ProfileCanvasProps) {
  const section = PROFILE_SECTIONS.find(s => s.id === sectionId) ?? PROFILE_SECTIONS[0];
  const Component = section.component;
  const sectionErrors = validationErrors.filter(e => e.card === section.id);
  const { previous, next, isLast } = getAdjacentProfileSections(section.id);
  const hasAnyErrors = validationErrors.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <header className="mb-5">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{section.label}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{section.description}</p>
        </header>

        <div>
          <Component validationErrors={sectionErrors} />
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
          <div>
            {previous && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setView({ kind: 'profile', sectionId: previous.id })}
              >
                ← {previous.label}
              </button>
            )}
          </div>
          <div>
            {isLast ? (
              <button
                type="button"
                className="btn-cta !w-auto px-5"
                onClick={() => {
                  if (hasAnyErrors) return;
                  onRun();
                  setView({ kind: 'results', sectionId: 'all' });
                }}
                disabled={isRunning || hasAnyErrors}
                title={hasAnyErrors ? 'Fix validation errors first' : undefined}
              >
                {isRunning ? 'Running…' : 'Review & run simulation →'}
              </button>
            ) : next ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setView({ kind: 'profile', sectionId: next.id })}
              >
                {next.label} →
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
