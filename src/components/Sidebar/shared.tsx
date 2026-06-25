import React, { useState } from 'react';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-500'}`}
        onClick={() => onChange(!checked)}
      >
        <div
          className="absolute w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
          style={{ top: '50%', transform: `translateY(-50%) translateX(${checked ? '18px' : '2px'})` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

export function PctSlider({ value, onChange, label, min = 0, max = 10, step = 0.1, suffix = '%', tooltip }: {
  value: number; onChange: (v: number) => void; label: string;
  min?: number; max?: number; step?: number; suffix?: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <label className="input-label mb-0">{label}{tooltip}</label>
        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{value.toFixed(step < 1 ? 1 : 0)}{suffix}</span>
      </div>
      <div>
        <input
          type="range"
          className="w-full cursor-pointer"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}

// ---- Canvas layout primitives -------------------------------------------------
// Section: a card-style group with a heading + optional description, used inside
// the canvas profile pages. Set `collapsible` for sections users can fold away.
export function Section({
  title,
  description,
  trailing,
  collapsible,
  defaultOpen = true,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400"
              aria-expanded={open}
            >
              <Chevron open={open} />
              <span>{title}</span>
            </button>
          ) : (
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {trailing && <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{trailing}</div>}
      </div>
      {showBody && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          {children}
        </div>
      )}
    </section>
  );
}

// Field: standard label + control + help row. Use `width="age"` for a fixed
// narrow column that won't shift based on help-text length.
export function Field({
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
  const wrapperClass = width === 'age' ? 'shrink-0 w-56' : '';
  return (
    <div className={wrapperClass}>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      {children}
      {help && <p className={`mt-1 text-[11px] ${helpClass}`}>{help}</p>}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`}
      fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
