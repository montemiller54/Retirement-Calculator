/**
 * Explain cashflow at key ages for the 11kAt55 scenario.
 */
import { runSimulation } from '../src/engine/simulation';
import type { ScenarioInput } from '../src/types';
import scenarioJson from '/Users/mm39036/Downloads/11kAt55 (1).json';

const scenario = scenarioJson as unknown as ScenarioInput;

// Run deterministic (expected path) simulation
const result = runSimulation(scenario, { numSimulations: 5000, seed: 42 });
const expected = result.expectedPath;

console.log('═══ Cashflow Breakdown by Age ═══\n');
console.log('Age │ Spending  │ SS+Pension │ 401k Trad │ Roth 401k │ Taxable  │ HSA      │ Taxes    │ RMD      │ Excess RMD │ Bar Total  │ Gap (Bar-Spend)');
console.log('────┼───────────┼────────────┼───────────┼───────────┼──────────┼──────────┼──────────┼──────────┼────────────┼────────────┼────────────────');

const ages = [54, 55, 60, 62, 65, 70, 72, 73, 75, 80, 85, 90, 95];
for (const yr of expected) {
  if (!ages.includes(yr.age)) continue;
  const ss = yr.income.socialSecurity;
  const pension = yr.income.pension;
  const other = yr.income.other;
  const w = yr.withdrawals;
  const trad = w.traditional401k + w.traditionalIRA;
  const roth = w.roth401k + w.rothIRA;
  const taxable = w.taxable;
  const hsa = w.hsa;
  const cash = w.cashAccount + w.otherAssets;
  const barTotal = ss + pension + other + trad + roth + taxable + hsa + cash;
  const gap = barTotal - yr.spending;
  
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`.padStart(9);
  
  console.log(
    `${String(yr.age).padStart(3)} │${fmt(yr.spending)} │${fmt(ss + pension).padStart(11)} │${fmt(trad)} │${fmt(roth)} │${fmt(taxable)} │${fmt(hsa)} │${fmt(yr.taxes.total)} │${fmt(yr.rmdAmount)} │${fmt(Math.max(0, yr.rmdAmount - yr.spending + ss + pension)).padStart(11)} │${fmt(barTotal).padStart(11)} │${fmt(gap)}`
  );
}

console.log('\n═══ Account Balances at Key Ages ═══\n');
console.log('Age │ Trad 401k  │ Roth 401k  │ Taxable    │ HSA        │ Total');
console.log('────┼────────────┼────────────┼────────────┼────────────┼────────────');
for (const yr of expected) {
  if (!ages.includes(yr.age)) continue;
  const b = yr.balances;
  const total = b.traditional401k + b.roth401k + b.traditionalIRA + b.rothIRA + b.taxable + b.hsa + b.cashAccount + b.otherAssets;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`.padStart(11);
  console.log(
    `${String(yr.age).padStart(3)} │${fmt(b.traditional401k)} │${fmt(b.roth401k)} │${fmt(b.taxable)} │${fmt(b.hsa)} │${fmt(total)}`
  );
}
