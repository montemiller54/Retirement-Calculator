/**
 * Adapter that runs an ExternalScenario through our Monte Carlo engine
 * with all real-world features disabled (no SS, no pensions, no taxes,
 * no guardrails, no healthcare) so it matches what Bengen/Pfau/cFIREsim
 * actually model: a single pool, constant real spending, allocation-only.
 */

import { runSimulation, findSafeSpending } from '../../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../../src/constants/defaults';
import {
  makeUniformAllocations,
  DEFAULT_ASSET_RETURNS,
  DEFAULT_CRASH_FREQUENCY,
} from '../../src/constants/asset-classes';
import type { ScenarioInput, AssetAllocation } from '../../src/types';
import type { ExternalScenario } from './scenarios';

const OFF_GUARDRAILS = { ...DEFAULT_SCENARIO.guardrails, enabled: false };
const ON_GUARDRAILS = { ...DEFAULT_SCENARIO.guardrails, enabled: true };
const OFF_HEALTHCARE = { ...DEFAULT_SCENARIO.healthcare, enabled: false };
const OFF_ROTH = { ...DEFAULT_SCENARIO.rothConversion, enabled: false };
const OFF_BUFFER = { ...DEFAULT_SCENARIO.cashBuffer, enabled: false };

function alloc(stocks: number, bonds: number): AssetAllocation {
  return { stocks: stocks * 100, bonds: bonds * 100, cash: 0, crypto: 0 };
}

function zeroBalances() {
  return {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };
}

function buildScenario(s: ExternalScenario, guardrailsOn = false): ScenarioInput {
  const startAge = 65;
  const endAge = startAge + s.years;
  return {
    ...DEFAULT_SCENARIO,
    currentAge: startAge,
    retirementAge: startAge,
    endAge,
    filingStatus: 'single',
    jobs: [],
    totalSavingsRate: 0,
    baseAnnualSpending: s.annualSpending / 12, // stored as monthly
    spendingInflationRate: 0.025,
    socialSecurityBenefit: 0,
    socialSecurityClaimAge: 99,
    pensionAmount: 0,
    otherIncomeSources: [],
    guardrails: guardrailsOn ? ON_GUARDRAILS : OFF_GUARDRAILS,
    healthcare: OFF_HEALTHCARE,
    rothConversion: OFF_ROTH,
    cashBuffer: OFF_BUFFER,
    balances: { ...zeroBalances(), taxable: s.initialBalance },
    taxableCostBasisPct: 1.0, // all basis → no cap gains drag
    investments: {
      mode: 'simple',
      riskProfile: 'balanced',
      preRetirement: makeUniformAllocations(alloc(s.stockPct, s.bondPct)),
      postRetirement: makeUniformAllocations(alloc(s.stockPct, s.bondPct)),
      assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
      crashFrequency: DEFAULT_CRASH_FREQUENCY,
    },
  };
}

export interface OurEngineResult {
  successRate: number;
  medianEndingBalance: number;
  p10EndingBalance: number;
  worstEndingBalance: number;
  safemaxRate: number;
}

export function runOurEngine(s: ExternalScenario, numSimulations = 5000): OurEngineResult {
  const scenario = buildScenario(s);
  const result = runSimulation(scenario, { numSimulations, seed: 12345 });

  const sorted = [...result.endingBalances].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p10 = sorted[Math.floor(sorted.length * 0.10)];
  const worst = sorted[0];

  // SAFEMAX equivalent: find spending level for 100% success, then express as % of initial
  // (Use 99% target to match Pfau's "highest constant rate that always survived"
  // — exact 100% is brittle in Monte Carlo.)
  const safe = findSafeSpending(scenario, 0.99);
  const safemaxRate = (safe.monthlySpending * 12) / s.initialBalance;

  return {
    successRate: result.successRate,
    medianEndingBalance: median,
    p10EndingBalance: p10,
    worstEndingBalance: worst,
    safemaxRate,
  };
}

/**
 * Run our engine with guardrails ENABLED, at a fixed initial withdrawal
 * rate (analogous to Guyton-Klinger's initial WR). Lets us compare how
 * our drawdown-based guardrails behave vs G-K's WR-based guardrails.
 */
export function runOurEngineWithGuardrails(
  s: ExternalScenario,
  initialWithdrawalRate: number,
  numSimulations = 5000,
): { successRate: number; medianEndingBalance: number; p10EndingBalance: number } {
  const adjusted: ExternalScenario = {
    ...s,
    annualSpending: s.initialBalance * initialWithdrawalRate,
  };
  const scenario = buildScenario(adjusted, /* guardrailsOn */ true);
  const result = runSimulation(scenario, { numSimulations, seed: 12345 });
  const sorted = [...result.endingBalances].sort((a, b) => a - b);
  return {
    successRate: result.successRate,
    medianEndingBalance: sorted[Math.floor(sorted.length / 2)],
    p10EndingBalance: sorted[Math.floor(sorted.length * 0.10)],
  };
}
