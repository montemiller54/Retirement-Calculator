import React, { useState, useRef, useEffect } from 'react';

/**
 * Currency input that displays comma-formatted values when not focused,
 * and allows raw numeric editing when focused.
 */
export function CurrencyInput({ value, onChange, className = '' }: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const formatted = value.toLocaleString('en-US');

  const handleFocus = () => {
    setEditing(true);
    setRaw(value === 0 ? '' : String(value));
  };

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseFloat(raw.replace(/,/g, '')) || 0;
    onChange(parsed);
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
      type={editing ? 'text' : 'text'}
      inputMode="decimal"
      className={`input-field pl-6 text-right ${className}`}
      value={editing ? raw : formatted}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
