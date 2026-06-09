/**
 * Diagnose safe spending discrepancy for the 11kAt55 scenario.
 * Runs the main simulation at various spending levels, then runs findSafeSpending,
 * and compares results.
 */
import { runSimulation, findSafeSpending } from '../src/engine/simulation';
import type { ScenarioInput } from '../src/types';

// Load scenario from JSON
import scenarioJson from '/Users/mm39036/Downloads/11kAt55.json';
const scenario = scenarioJson as unknown as ScenarioInput;

console.log('═══ Safe Spending Diagnostic ═══\n');
console.log(`Spending: $${scenario.baseAnnualSpending}/month`);
console.log(`Ages: ${scenario.currentAge} → retire ${scenario.retirementAge} → end ${scenario.endAge}`);
console.log(`Crash frequency: ${scenario.investments.crashFrequency}\n`);

// 1. Run main simulation at current spending with multiple seeds
console.log('─── Main Simulation (5000 sims each) ───');
const seeds = [undefined, 42, 12345, 99999, 777];
for (const seed of seeds) {
  const result = runSimulation(scenario, { numSimulations: 5000, seed });
  console.log(`  seed=${String(seed).padEnd(10)} → ${(result.successRate * 100).toFixed(1)}% success`);
}

// 2. Run at various spending levels with seed=undefined (random)
console.log('\n─── Success Rate vs Spending (5000 sims, random seed) ───');
for (const monthly of [9000, 10000, 10500, 11000, 11500, 12000, 13000, 14000]) {
  const testScenario = { ...scenario, baseAnnualSpending: monthly };
  const result = runSimulation(testScenario, { numSimulations: 5000 });
  console.log(`  $${String(monthly).padEnd(6)}/mo → ${(result.successRate * 100).toFixed(1)}%`);
}

// 3. Run at various spending levels with seed=42
console.log('\n─── Success Rate vs Spending (5000 sims, seed=42) ───');
for (const monthly of [9000, 10000, 10500, 11000, 11500, 12000, 13000, 14000]) {
  const testScenario = { ...scenario, baseAnnualSpending: monthly };
  const result = runSimulation(testScenario, { numSimulations: 5000, seed: 42 });
  console.log(`  $${String(monthly).padEnd(6)}/mo → ${(result.successRate * 100).toFixed(1)}%`);
}

// 4. Run findSafeSpending at 80% target
console.log('\n─── findSafeSpending (80% target) ───');
const safe80 = findSafeSpending(scenario, 0.80);
console.log(`  Result: $${safe80.monthlySpending}/mo ($${safe80.annualSpending}/yr)`);
console.log(`  Achieved: ${(safe80.achievedSuccessRate * 100).toFixed(1)}%`);

// 5. Verify: run main simulation at the safe spending level
console.log('\n─── Verify safe spending with main simulation ───');
const verifyScenario = { ...scenario, baseAnnualSpending: safe80.monthlySpending, guardrails: { ...scenario.guardrails, enabled: false } };
for (const seed of [undefined, 42, 12345]) {
  const result = runSimulation(verifyScenario, { numSimulations: 5000, seed });
  console.log(`  $${safe80.monthlySpending}/mo, seed=${String(seed).padEnd(10)} → ${(result.successRate * 100).toFixed(1)}%`);
}

console.log('\n═══ Done ═══');
