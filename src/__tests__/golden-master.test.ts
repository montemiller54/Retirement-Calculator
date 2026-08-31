import { describe, it, expect } from 'vitest';
import { runSimulation } from '../engine/simulation';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import type { ScenarioInput } from '../types';

/**
 * Golden-master regression gate.
 *
 * Pins exact seeded outputs for four scenarios that collectively exercise
 * most engine features. ANY change to these numbers means engine behavior
 * changed: if intentional (an accuracy fix or recalibration), re-run with
 * CAPTURE=1 (`CAPTURE=1 npx vitest run src/__tests__/golden-master.test.ts`)
 * and paste the new values; if not intentional, you found a regression.
 */

const SIMS = 200;
const SEED = 777;

// 1. Default accumulation-heavy scenario (auto SS, jobs, contributions)
const accumulation: ScenarioInput = { ...DEFAULT_SCENARIO };

// 2. MFJ early retiree: pension, rule of 55, healthcare+IRMAA, housing, guardrails
const earlyRetiree: ScenarioInput = {
  ...DEFAULT_SCENARIO,
  name: 'golden-early-retiree',
  currentAge: 48, retirementAge: 55, endAge: 94,
  filingStatus: 'mfj', stateCode: 'IA',
  socialSecurityMode: 'auto', socialSecurityClaimAge: 62,
  pensionAmount: 4600, pensionStartAge: 62, pensionCOLA: 0,
  baseMonthlySpending: 11000,
  ruleof55Eligible: true,
  guardrails: { enabled: true, tiers: [{ drawdownPct: 20, spendingCutPct: 20 }] },
  healthcare: {
    enabled: true, preMedicareMonthly: 700, medicareMonthly: 500, lateLifeMonthly: 8000,
    medicareStartAge: 65, lateLifeStartAge: 90, inflationRate: 0.033,
  },
  housing: { enabled: true, mortgagePayment: 2000, payoffAge: 60, downsizingProceeds: 0, downsizingAge: 99 },
  spouse: { enabled: true, currentAge: 47, retirementAge: 62, socialSecurityBenefit: 0, socialSecurityClaimAge: 62 },
  balances: {
    traditional401k: 790000, roth401k: 400000, traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 8000, cashAccount: 0, otherAssets: 0,
  },
};

// 3. Single retiree: fillBracket Roth conversions, taxable w/ dividends, taxEfficient
const converter: ScenarioInput = {
  ...DEFAULT_SCENARIO,
  name: 'golden-converter',
  currentAge: 62, retirementAge: 62, endAge: 90,
  filingStatus: 'single', stateCode: 'CA',
  socialSecurityMode: 'manual', socialSecurityBenefit: 2400, socialSecurityClaimAge: 70,
  baseMonthlySpending: 6000,
  jobs: [] as ScenarioInput['jobs'],
  rothConversion: {
    enabled: true, strategy: 'fillBracket', targetBracketRate: 0.12,
    fixedAnnualAmount: 0, startAge: 62, endAge: 70,
  },
  balances: {
    traditional401k: 900000, roth401k: 0, traditionalIRA: 300000, rothIRA: 100000,
    taxable: 400000, hsa: 0, cashAccount: 50000, otherAssets: 0,
  },
  taxableCostBasisPct: 0.6,
};

// 4. Working couple, proRata withdrawals, one-time expenses, other income
const couple: ScenarioInput = {
  ...DEFAULT_SCENARIO,
  name: 'golden-couple',
  currentAge: 55, retirementAge: 60, endAge: 92,
  filingStatus: 'mfj', stateCode: 'TX',
  socialSecurityMode: 'manual', socialSecurityBenefit: 2800, socialSecurityClaimAge: 67,
  baseMonthlySpending: 7000,
  withdrawalStrategy: 'proRata',
  jobs: [
    { id: 'p', name: 'P', owner: 'primary', monthlyPay: 10000, startAge: 55, endAge: 60,
      has401k: true, employerMatchRate: 0.5, employerMatchCapPct: 0.06, employerRothPct: 0 },
    { id: 's', name: 'S', owner: 'spouse', monthlyPay: 6000, startAge: 54, endAge: 62,
      has401k: false, employerMatchRate: 0, employerMatchCapPct: 0, employerRothPct: 0 },
  ],
  spouse: { enabled: true, currentAge: 54, retirementAge: 62, socialSecurityBenefit: 1400, socialSecurityClaimAge: 67 },
  oneTimeExpenses: [
    { id: 'x', name: 'roof', amount: 40000, age: 65, inflationAdjusted: true },
  ],
  otherIncomeSources: [
    { id: 'r', name: 'rental', monthlyAmount: 1200, startAge: 60, endAge: 75, inflationRate: 0.02 },
  ],
  balances: {
    traditional401k: 600000, roth401k: 150000, traditionalIRA: 100000, rothIRA: 80000,
    taxable: 250000, hsa: 30000, cashAccount: 40000, otherAssets: 50000,
  },
};

interface Fingerprint {
  successRate: number;
  medianEnding: number;
  finalMedianBalance: number;
  y10Spending: number;
  y10TaxTotal: number;
  y10TotalBalance: number;
}

function fingerprint(s: ScenarioInput): Fingerprint {
  const r = runSimulation(s, { numSimulations: SIMS, seed: SEED });
  const sorted = [...r.endingBalances].sort((a, b) => a - b);
  const y10 = r.medianPath[Math.min(10, r.medianPath.length - 1)];
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    successRate: r.successRate,
    medianEnding: round(sorted[Math.floor(sorted.length / 2)]),
    finalMedianBalance: round(r.medianPath[r.medianPath.length - 1].totalBalance),
    y10Spending: round(y10.spending),
    y10TaxTotal: round(y10.taxes.total),
    y10TotalBalance: round(y10.totalBalance),
  };
}

const SCENARIOS: Record<string, ScenarioInput> = {
  accumulation, earlyRetiree, converter, couple,
};

// Captured baselines — regenerate with CAPTURE=1 after intentional engine changes
const EXPECTED: Record<string, Fingerprint> = {
  accumulation: { successRate: 0.955, medianEnding: 13627379.41, finalMedianBalance: 13488807.03, y10Spending: 0, y10TaxTotal: 27881.56, y10TotalBalance: 702995.02 },
  earlyRetiree: { successRate: 0.21, medianEnding: 0, finalMedianBalance: 0, y10Spending: 189163.18, y10TaxTotal: 26372.21, y10TotalBalance: 1496365.31 },
  converter: { successRate: 0.945, medianEnding: 2141812.47, finalMedianBalance: 2127212.86, y10Spending: 92018.46, y10TaxTotal: 20115.35, y10TotalBalance: 1921940.24 },
  couple: { successRate: 0.96, medianEnding: 7566420.84, finalMedianBalance: 7522177.9, y10Spending: 160695.02, y10TaxTotal: 8188.62, y10TotalBalance: 2578152.51 },
};

describe('Golden master (seeded engine fingerprints)', () => {
  if (process.env.CAPTURE) {
    it('CAPTURE MODE — printing current fingerprints', () => {
      const out: Record<string, Fingerprint> = {};
      for (const [name, s] of Object.entries(SCENARIOS)) out[name] = fingerprint(s);
      console.log('\nGOLDEN_CAPTURE_BEGIN\n' + JSON.stringify(out, null, 2) + '\nGOLDEN_CAPTURE_END\n');
      expect(true).toBe(true);
    });
    return;
  }

  for (const name of Object.keys(SCENARIOS)) {
    it(`${name} fingerprint is unchanged`, () => {
      const actual = fingerprint(SCENARIOS[name]);
      const expected = EXPECTED[name];
      expect(actual.successRate).toBeCloseTo(expected.successRate, 10);
      expect(actual.medianEnding).toBeCloseTo(expected.medianEnding, 2);
      expect(actual.finalMedianBalance).toBeCloseTo(expected.finalMedianBalance, 2);
      expect(actual.y10Spending).toBeCloseTo(expected.y10Spending, 2);
      expect(actual.y10TaxTotal).toBeCloseTo(expected.y10TaxTotal, 2);
      expect(actual.y10TotalBalance).toBeCloseTo(expected.y10TotalBalance, 2);
    });
  }
});
