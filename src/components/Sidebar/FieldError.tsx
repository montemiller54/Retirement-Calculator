import React from 'react';
import type { ValidationError } from '../../utils/validation';

interface FieldErrorProps {
  errors: ValidationError[];
  field: string;
}

export function FieldError({ errors, field }: FieldErrorProps) {
  const match = errors.find(e => e.field === field || e.field.startsWith(field + '.'));
  if (!match) return null;
  return <p className="text-[10px] text-red-500 mt-0.5">{match.message}</p>;
}

export function fieldErrorClass(errors: ValidationError[], field: string): string {
  const hasError = errors.some(e => e.field === field || e.field.startsWith(field + '.'));
  return hasError ? 'ring-1 ring-red-400 border-red-400' : '';
}

export interface CardProps {
  validationErrors: ValidationError[];
}
