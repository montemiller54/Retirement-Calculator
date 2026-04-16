import React from 'react';
import type { YearResult } from '../../types';
import { formatCurrency } from '../../utils/format';

interface TrajectoryTableProps {
  data: YearResult[];
}

export function TrajectoryTable({ data }: TrajectoryTableProps) {
  // Show every 5 years
  const filtered = data.filter((_, i) => i % 5 === 0 || i === data.length - 1);

  return (
    <div className="card overflow-x-auto">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Typical Outcome Summary
      </h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1 pr-2">Age</th>
            <th className="text-right py-1 px-2">Balance</th>
            <th className="text-right py-1 px-2">Income</th>
            <th className="text-right py-1 px-2">Spending</th>
            <th className="text-right py-1 px-2">Taxes</th>
            <th className="text-right py-1 px-2">Returns</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(yr => (
            <tr key={yr.age} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1 pr-2 font-medium">{yr.age}</td>
              <td className={`text-right py-1 px-2 ${yr.depleted ? 'text-red-500' : ''}`}>
                {formatCurrency(yr.totalBalance)}
              </td>
              <td className="text-right py-1 px-2">{formatCurrency(yr.income.total)}</td>
              <td className="text-right py-1 px-2">{formatCurrency(yr.spending)}</td>
              <td className="text-right py-1 px-2">{formatCurrency(yr.taxes.total)}</td>
              <td className="text-right py-1 px-2">{formatCurrency(yr.investmentReturn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
