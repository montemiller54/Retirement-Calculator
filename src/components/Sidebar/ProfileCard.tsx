import React, { useState, useEffect, useRef } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import { FILING_STATUS_LABELS, type FilingStatus } from '../../types';
import { STATE_TAX_DATA, STATE_CODES } from '../../constants/state-tax';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';

interface Toast {
  message: string;
  undoJobs: { id: string; name: string; oldEndAge: number }[];
}

export function ProfileCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // Clear toast timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const handleRetirementAgeChange = (newAge: number) => {
    const oldAge = scenario.retirementAge;
    setField('retirementAge', newAge);

    // Auto-sync: update jobs whose endAge matched the old retirement age
    const jobsToSync = scenario.jobs.filter(j => j.endAge === oldAge);
    if (jobsToSync.length > 0) {
      const undoInfo = jobsToSync.map(j => ({ id: j.id, name: j.name, oldEndAge: j.endAge }));
      const updatedJobs = scenario.jobs.map(j =>
        j.endAge === oldAge ? { ...j, endAge: newAge } : j,
      );
      setField('jobs', updatedJobs);

      // Show toast
      if (toastTimer.current) clearTimeout(toastTimer.current);
      const names = jobsToSync.map(j => j.name).join(', ');
      setToast({
        message: `Updated ${names} end age to ${newAge}`,
        undoJobs: undoInfo,
      });
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    }
  };

  const handleUndo = () => {
    if (!toast) return;
    const updatedJobs = scenario.jobs.map(j => {
      const undo = toast.undoJobs.find(u => u.id === j.id);
      return undo ? { ...j, endAge: undo.oldEndAge } : j;
    });
    setField('jobs', updatedJobs);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  };

  return (
    <div className="space-y-8">
      <Section
        title="Timeline"
        description="When you're working, when you stop, and how long the plan needs to last."
      >
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Field label="Your age" help="You today." width="age">
            <input
              type="number"
              className={`input-field text-center w-24 ${fieldErrorClass(ve, 'currentAge')}`}
              value={scenario.currentAge}
              min={18}
              max={99}
              onChange={e => setField('currentAge', parseInt(e.target.value) || 0)}
            />
            <FieldError errors={ve} field="currentAge" />
          </Field>
          <Field
            label="Retire at"
            help={
              scenario.currentAge >= scenario.retirementAge
                ? 'You are already retired.'
                : 'When you stop working full-time.'
            }
            helpTone={scenario.currentAge >= scenario.retirementAge ? 'success' : 'muted'}
            width="age"
          >
            <input
              type="number"
              className={`input-field text-center w-24 ${fieldErrorClass(ve, 'retirementAge')}`}
              value={scenario.retirementAge}
              min={18}
              max={99}
              onChange={e => handleRetirementAgeChange(parseInt(e.target.value) || 65)}
            />
            <FieldError errors={ve} field="retirementAge" />
          </Field>
          <Field label="Plan to" help="Often 90–95 to plan for longer lives." width="age">
            <input
              type="number"
              className={`input-field text-center w-24 ${fieldErrorClass(ve, 'endAge')}`}
              value={scenario.endAge}
              min={scenario.currentAge + 1}
              max={120}
              onChange={e => setField('endAge', parseInt(e.target.value) || 0)}
            />
            <FieldError errors={ve} field="endAge" />
          </Field>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/50">
          {scenario.spouse?.enabled ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Spouse</h3>
                <button
                  type="button"
                  onClick={() => setField('spouse.enabled', false)}
                  className="text-[11px] text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </div>
              <Field label="Spouse age" help="Spouse today." width="age">
                <input
                  type="number"
                  className={`input-field text-center w-24 ${fieldErrorClass(ve, 'spouse.currentAge')}`}
                  value={scenario.spouse.currentAge}
                  min={18}
                  max={99}
                  onChange={e => setField('spouse.currentAge', parseInt(e.target.value) || 0)}
                />
                <FieldError errors={ve} field="spouse.currentAge" />
              </Field>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setField('spouse.enabled', true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                <span className="text-base leading-none">+</span> Add spouse
              </button>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                Models joint income, joint Social Security, and joint expenses.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Taxes"
        description="Used to estimate federal and state income taxes throughout the plan."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Field label="State" help="Determines state income tax treatment.">
            <select
              className="input-field"
              value={scenario.stateCode ?? 'IA'}
              onChange={e => setField('stateCode', e.target.value)}
            >
              {STATE_CODES.map(code => (
                <option key={code} value={code}>{STATE_TAX_DATA[code].label}</option>
              ))}
            </select>
          </Field>
          <Field label="Filing status" help="Married Filing Jointly generally gives the best rates for married couples.">
            <select
              className="input-field"
              value={scenario.filingStatus ?? 'hoh'}
              onChange={e => setField('filingStatus', e.target.value as FilingStatus)}
            >
              {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* Toast notification for auto-synced job end age */}
      {toast && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 animate-in fade-in">
          <span>{toast.message}</span>
          <button
            className="font-medium underline hover:text-blue-900 dark:hover:text-blue-100 shrink-0"
            onClick={handleUndo}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// Local layout helpers — co-located with the card so we can iterate freely.
// Once the pattern stabilizes across all profile cards we can promote them
// into a shared module.
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  help,
  helpTone = 'muted',
  width,
  children,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  helpTone?: 'muted' | 'success';
  width?: 'age';
  children: React.ReactNode;
}) {
  const helpClass =
    helpTone === 'success'
      ? 'text-green-600 dark:text-green-400 font-medium'
      : 'text-gray-500 dark:text-gray-400';
  // width="age" fixes the wrapper to a consistent column width so fields don't
  // shift based on help-text length
  const wrapperClass = width === 'age' ? 'shrink-0 w-44' : '';
  return (
    <div className={wrapperClass}>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      {children}
      {help && <p className={`mt-1 text-[11px] ${helpClass}`}>{help}</p>}
    </div>
  );
}
