import React from 'react';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-500'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1">
        <label className="input-label mb-0">{label}{tooltip}</label>
        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{value.toFixed(step < 1 ? 1 : 0)}{suffix}</span>
      </div>
      <div className="mt-auto">
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
