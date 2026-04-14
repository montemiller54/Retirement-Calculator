import React from 'react';
import { useScenario } from '../../context/ScenarioContext';
import type { OneTimeExpense } from '../../types';

export function SpendingSection() {
  const { scenario, setField } = useScenario();

  const addExpense = () => {
    const newExpense: OneTimeExpense = {
      id: crypto.randomUUID(),
      name: 'New Expense',
      amount: 10000,
      age: scenario.retirementAge,
      inflationAdjusted: true,
    };
    setField('oneTimeExpenses', [...scenario.oneTimeExpenses, newExpense]);
  };

  const removeExpense = (id: string) => {
    setField('oneTimeExpenses', scenario.oneTimeExpenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, field: keyof OneTimeExpense, value: unknown) => {
    setField(
      'oneTimeExpenses',
      scenario.oneTimeExpenses.map(e => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="section-title">Retirement Spending</h3>

      <div>
        <label className="input-label">Base Monthly Spending ($, today's dollars)</label>
        <input
          type="number"
          className="input-field"
          value={scenario.baseAnnualSpending}
          onChange={e => setField('baseAnnualSpending', parseFloat(e.target.value) || 0)}
        />
      </div>

      <div>
        <label className="input-label">Spending Inflation (%)</label>
        <input
          type="number"
          className="input-field w-20"
          step="0.1"
          value={(scenario.spendingInflationRate * 100).toFixed(1)}
          onChange={e => setField('spendingInflationRate', (parseFloat(e.target.value) || 0) / 100)}
        />
      </div>

      <div>
        <label className="input-label">Tax Bracket Inflation (%)</label>
        <input
          type="number"
          className="input-field w-20"
          step="0.1"
          value={((scenario.taxBracketInflationRate ?? 0.02) * 100).toFixed(1)}
          onChange={e => setField('taxBracketInflationRate', (parseFloat(e.target.value) || 0) / 100)}
        />
        <p className="text-[10px] text-gray-400 mt-0.5">Annual indexing of federal brackets, deductions, and thresholds (Chained CPI-U ≈ 2.0%)</p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="input-label mb-0">One-Time Expenses</label>
          <button
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            onClick={addExpense}
          >
            + Add
          </button>
        </div>
        {scenario.oneTimeExpenses.map(exp => (
          <div key={exp.id} className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs space-y-1">
            <div className="flex gap-1">
              <input
                className="input-field flex-1"
                value={exp.name}
                onChange={e => updateExpense(exp.id, 'name', e.target.value)}
              />
              <button
                className="text-red-400 hover:text-red-600 px-1"
                onClick={() => removeExpense(exp.id)}
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="input-label">Amount ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={exp.amount}
                  onChange={e => updateExpense(exp.id, 'amount', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="w-16">
                <label className="input-label">Age</label>
                <input
                  type="number"
                  className="input-field"
                  value={exp.age}
                  onChange={e => updateExpense(exp.id, 'age', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={exp.inflationAdjusted}
                onChange={e => updateExpense(exp.id, 'inflationAdjusted', e.target.checked)}
              />
              Inflation-adjusted
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
