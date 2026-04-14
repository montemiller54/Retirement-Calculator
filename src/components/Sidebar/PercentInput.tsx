import React, { useState, useRef, useEffect } from 'react';

/**
 * Percentage input that displays a formatted value when not focused,
 * and allows raw numeric editing when focused (avoiding the
 * format-on-every-keystroke cursor/value problem).
 *
 * `value` is the raw decimal (e.g. 0.09 for 9%).
 * `onChange` receives the raw decimal back.
 */
export function PercentInput({
  value,
  onChange,
  decimals = 1,
  step = 0.1,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  decimals?: number;
  step?: number;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayed = (value * 100).toFixed(decimals);

  const handleFocus = () => {
    setEditing(true);
    setRaw(displayed);
  };

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseFloat(raw);
    onChange((isNaN(parsed) ? 0 : parsed) / 100);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRaw(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') inputRef.current?.blur();
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <input
      ref={inputRef}
      type="number"
      step={step}
      inputMode="decimal"
      className={className}
      value={editing ? raw : displayed}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
