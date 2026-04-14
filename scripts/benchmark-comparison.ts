/**
 * Retirement Planner – Benchmark Comparison
 *
 * Runs our Monte Carlo engine with standardised inputs that match common
 * benchmarks published by FireCalc, cFIREsim, Fidelity, and the Trinity Study.
 *
 * Usage:  npx tsx scripts/benchmark-comparison.ts
 */

import { runSimulation } from '../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../src/constants/defaults';
import { makeUniformAllocations, DEFAULT_ASSET_RETURNS, DEFAULT_FAT_TAIL_DF } from '../src/constants/asset-classes';
import type { ScenarioInput, AssetAllocation } from '../src/types';

// ── Helper ────────────────────────────────────────────────────────────
function scenario(overrides: Partial<ScenarioInput>): ScenarioInput {
  return { ...DEFAULT_SCENARIO, ...overrides };
}

const OFF_GUARDRAILS = { ...DEFAULT_SCENARIO.guardrails, enabled: false };
const OFF_HEALTHCARE = { ...DEFAULT_SCENARIO.healthcare, enabled: false };
const OFF_ROTH = { ...DEFAULT_SCENARIO.rothConversion, enabled: false };
const OFF_BUFFER = { ...DEFAULT_SCENARIO.cashBuffer, enabled: false };

function zeroBalances() {
  return {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };
}

function alloc(stocks: number, bonds: number, cashPct: number = 0): AssetAllocation {
  return {
    stocks: stocks,
    bonds: bonds,
    cash: cashPct,
    crypto: 0,
  };
}

// ── Benchmark Scenarios ──────────────────────────────────────────────
interface Benchmark {
  name: string;
  description: string;
  scenario: ScenarioInput;
  expectedRange: [number, number]; // expected success rate range (%)
  source: string;
}

const SIMS = 10000;
const SEED = 12345;

const benchmarks: Benchmark[] = [
  // ── 1. Classic 4% Rule (Trinity Study) ──
  // $1M portfolio, 75/25 stocks/bonds, $40K/yr spending, 30-year horizon
  // FireCalc historical: ~95%.  Monte Carlo: 85-95% depending on assumptions.
  {
    name: '4% Rule – 75/25',
    description: '$1M, 75/25 stocks/bonds, $40K/yr, 30 years, no SS/pension',
    source: 'Trinity Study / FireCalc historical ≈ 95%, Monte Carlo ≈ 85-95%',
    expectedRange: [82, 98],
    scenario: scenario({
      currentAge: 65, retirementAge: 65, endAge: 95,
      filingStatus: 'single',
      currentSalary: 0, totalSavingsRate: 0,
      baseAnnualSpending: 40000 / 12,
      spendingInflationRate: 0.025,
      socialSecurityBenefit: 0, socialSecurityClaimAge: 99,
      pensionAmount: 0,
      otherIncomeSources: [],
      guardrails: OFF_GUARDRAILS,
      healthcare: OFF_HEALTHCARE,
      rothConversion: OFF_ROTH,
      cashBuffer: OFF_BUFFER,
      balances: { ...zeroBalances(), taxable: 1000000 },
      taxableCostBasisPct: 1.0, // all basis = no cap gains tax drag
      investments: {
        mode: 'simple',
        riskProfile: 'balanced',
        preRetirement: makeUniformAllocations(alloc(75, 25)),
        postRetirement: makeUniformAllocations(alloc(75, 25)),
        assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
        fatTailDf: DEFAULT_FAT_TAIL_DF,
      },
    }),
  },

  // ── 2. Conservative 4% Rule – 50/50 ──
  // Lower equity → slightly lower success vs. 75/25
  {
    name: '4% Rule – 50/50',
    description: '$1M, 50/50 stocks/bonds, $40K/yr, 30 years',
    source: 'Trinity Study 50/50 ≈ 87-92%, Monte Carlo ≈ 78-90%',
    expectedRange: [75, 93],
    scenario: scenario({
      currentAge: 65, retirementAge: 65, endAge: 95,
      filingStatus: 'single',
      currentSalary: 0, totalSavingsRate: 0,
      baseAnnualSpending: 40000 / 12,
      spendingInflationRate: 0.025,
      socialSecurityBenefit: 0, socialSecurityClaimAge: 99,
      pensionAmount: 0,
      otherIncomeSources: [],
      guardrails: OFF_GUARDRAILS,
      healthcare: OFF_HEALTHCARE,
      rothConversion: OFF_ROTH,
      cashBuffer: OFF_BUFFER,
      balances: { ...zeroBalances(), taxable: 1000000 },
      taxableCostBasisPct: 1.0,
      investments: {
        mode: 'simple',
        riskProfile: 'balanced',
        preRetirement: makeUniformAllocations(alloc(50, 50)),
        postRetirement: makeUniformAllocations(alloc(50, 50)),
        assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
        fatTailDf: DEFAULT_FAT_TAIL_DF,
      },
    }),
  },

  // ── 3. Low withdrawal rate – 3% rule ──
  // Should be very high success: ~98-100%
  {
    name: '3% Rule – 60/40',
    description: '$1M, 60/40, $30K/yr, 30 years',
    source: 'All planners ≈ 97-100%',
    expectedRange: [95, 100],
    scenario: scenario({
      currentAge: 65, retirementAge: 65, endAge: 95,
      filingStatus: 'single',
      currentSalary: 0, totalSavingsRate: 0,
      baseAnnualSpending: 30000 / 12,
      spendingInflationRate: 0.025,
      socialSecurityBenefit: 0, socialSecurityClaimAge: 99,
      pensionAmount: 0,
      otherIncomeSources: [],
      guardrails: OFF_GUARDRAILS,
      healthcare: OFF_HEALTHCARE,
      rothConversion: OFF_ROTH,
      cashBuffer: OFF_BUFFER,
      balances: { ...zeroBalances(), taxable: 1000000 },
      taxableCostBasisPct: 1.0,
      investments: {
        mode: 'simple',
        riskProfile: 'balanced',
        preRetirement: makeUniformAllocations(alloc(60, 40)),
        postRetirement: makeUniformAllocations(alloc(60, 40)),
        assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
        fatTailDf: DEFAULT_FAT_TAIL_DF,
      },
    }),
  },

  // ── 4. High withdrawal rate – 5% rule ──
  // Expected to be risky: ~60-80%
  {
    name: '5% Rule – 60/40',
    description: '$1M, 60/40, $50K/yr, 30 years',
    source: 'Trinity Study ≈ 65-78%, Monte Carlo ≈ 60-78%',
    expectedRange: [55, 82],
    scenario: scenario({
      currentAge: 65, retirementAge: 65, endAge: 95,
      filingStatus: 'single',
      currentSalary: 0, totalSavingsRate: 0,
      baseAnnualSpending: 50000 / 12,
      spendingInflationRate: 0.025,
      socialSecurityBenefit: 0, socialSecurityClaimAge: 99,
      pensionAmount: 0,
      otherIncomeSources: [],
      guardrails: OFF_GUARDRAILS,
      healthcare: OFF_HEALTHCARE,
      rothConversion: OFF_ROTH,
      cashBuffer: OFF_BUFFER,
      balances: { ...zeroBalances(), taxable: 1000000 },
      taxableCostBasisPct: 1.0,
      investments: {
        mode: 'simple',
        riskProfile: 'balanced',
        preRetirement: makeUniformAllocations(alloc(60, 40)),
        postRetirement: makeUniformAllocations(alloc(60, 40)),
        assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
        fatTailDf: DEFAULT_FAT_TAIL_DF,
      },
    }),
  },

  // ── 5. Early retiree with Social Security bridge ──
  // 55-year-old retiree, $1.5M, claims SS at 67 ($2500/mo), $60K/yr spending
  // Similar to Fidelity's "average" scenario
  {
    name: 'Early Retiree + SS',
    description: '$1.5M, 60/40, $5K/mo spending, SS $2500/mo at 67, retire 55, end 90',
    source: 'Fidelity-style scenario ≈ 80-92%',
    expectedRange: [75, 95],
    scenario: scenario({
      currentAge: 55, retirementAge: 55, endAge: 90,
      filingStatus: 'single',
      currentSalary: 0, totalSavingsRate: 0,
      baseAnnualSpending: 5000,
      spendingInflationRate: 0.025,
      socialSecurityBenefit: 2500, socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0.02,
      pensionAmount: 0,
      otherIncomeSources: [],
      guardrails: OFF_GUARDRAILS,
      healthcare: OFF_HEALTHCARE,
      rothConversion: OFF_ROTH,
      cashBuffer: OFF_BUFFER,
      balances: { ...zeroBalances(), traditional401k: 1000000, rothIRA: 300000, taxable: 200000 },
      taxableCostBasisPct: 0.7,
      investments: {
        mode: 'simple',
        riskProfile: 'balanced',
        preRetirement: makeUniformAllocations(alloc(60, 40)),
        postRetirement: makeUniformAllocations(alloc(60, 40)),
        assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
        fatTailDf: DEFAULT_FAT_TAIL_DF,
      },
    }),
  },

  // ── 6. Long horizon FIRE ──
  // 40-year-old retiree, $1.2M, 80/20, $40K/yr, 55 years of retirement
  // Very long horizon = more risk. cFIREsim: ~75-85%
  {
    name: 'FIRE – 55yr horizon',
    description: '$1.2M, 80/20, $40K/yr, retire 40 → 95, no SS until 67',
    source: 'cFIREsim ≈ 75-88%',
    expectedRange: [70, 92],
    scenario: scenario({
      currentAge: 40, retirementAge: 40, endAge: 95,
      filingStatus: 'single',
      currentSalary: 0, totalSavingsRate: 0,
      baseAnnualSpending: 40000 / 12,
      spendingInflationRate: 0.025,
      socialSecurityBenefit: 1500, socialSecurityClaimAge: 67,
      socialSecurityCOLA: 0.02,
      pensionAmount: 0,
      otherIncomeSources: [],
      guardrails: OFF_GUARDRAILS,
      healthcare: OFF_HEALTHCARE,
      rothConversion: OFF_ROTH,
      cashBuffer: OFF_BUFFER,
      balances: { ...zeroBalances(), taxable: 800000, rothIRA: 400000 },
      taxableCostBasisPct: 0.6,
      investments: {
        mode: 'simple',
        riskProfile: 'balanced',
        preRetirement: makeUniformAllocations(alloc(80, 20)),
        postRetirement: makeUniformAllocations(alloc(80, 20)),
        assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
        fatTailDf: DEFAULT_FAT_TAIL_DF,
      },
    }),
  },

  // ── 7. Normal distribution comparison (df=100 ≈ Gaussian) ──
  // Same as #1 but with near-normal tails — should have HIGHER success
  // because fat tails create more catastrophic downside scenarios
  {
    name: '4% Rule – Normal tails',
    description: 'Same as #1 but df=100 (near-Gaussian). Should be higher than fat-tail version.',
    source: 'Textbook Monte Carlo (no fat tails) ≈ 90-97%',
    expectedRange: [87, 99],
    scenario: scenario({
      currentAge: 65, retirementAge: 65, endAge: 95,
      filingStatus: 'single',
      currentSalary: 0, totalSavingsRate: 0,
      baseAnnualSpending: 40000 / 12,
      spendingInflationRate: 0.025,
      socialSecurityBenefit: 0, socialSecurityClaimAge: 99,
      pensionAmount: 0,
      otherIncomeSources: [],
      guardrails: OFF_GUARDRAILS,
      healthcare: OFF_HEALTHCARE,
      rothConversion: OFF_ROTH,
      cashBuffer: OFF_BUFFER,
      balances: { ...zeroBalances(), taxable: 1000000 },
      taxableCostBasisPct: 1.0,
      investments: {
        mode: 'simple',
        riskProfile: 'balanced',
        preRetirement: makeUniformAllocations(alloc(75, 25)),
        postRetirement: makeUniformAllocations(alloc(75, 25)),
        assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
        fatTailDf: 100,
      },
    }),
  },
];

// ── Feature Comparison ───────────────────────────────────────────────
const features = [
  { feature: 'Simulation method', ours: 'Monte Carlo (10,000 paths)', fireCalc: 'Historical rolling periods', cFIREsim: 'Historical rolling periods', fidelity: 'Monte Carlo', pviz: 'Monte Carlo' },
  { feature: 'Return distribution', ours: 'Student-t (df=6) fat tails', fireCalc: 'Historical actual', cFIREsim: 'Historical actual', fidelity: 'Proprietary (normal)', pviz: 'Normal or historical' },
  { feature: 'Asset classes', ours: '5 (US/Intl stocks, bonds, cash, crypto)', fireCalc: '2 (stocks, bonds)', cFIREsim: '3-4', fidelity: 'Multiple', pviz: 'Multiple' },
  { feature: 'Correlation modeling', ours: 'Cholesky decomposition', fireCalc: 'Implicit (historical)', cFIREsim: 'Implicit (historical)', fidelity: 'Yes', pviz: 'Yes' },
  { feature: 'Tax modeling', ours: 'Federal + state, bracket inflation', fireCalc: 'No', cFIREsim: 'Basic', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Filing status', ours: 'MFJ / HoH / Single', fireCalc: 'No', cFIREsim: 'No', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Social Security', ours: 'Yes, with COLA', fireCalc: 'Yes', cFIREsim: 'Yes', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Pension income', ours: 'Yes, with COLA', fireCalc: 'Yes', cFIREsim: 'Yes', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Account types', ours: '8 (401k, IRA, Roth, HSA, etc.)', fireCalc: '1 (single pool)', cFIREsim: '1-2', fidelity: 'Multiple', pviz: '1 (single pool)' },
  { feature: 'RMDs', ours: 'Yes (IRS Uniform table)', fireCalc: 'No', cFIREsim: 'No', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Roth conversions', ours: 'Fill-bracket + fixed amount', fireCalc: 'No', cFIREsim: 'No', fidelity: 'Basic', pviz: 'No' },
  { feature: 'Tax-aware withdrawals', ours: 'Iterative convergence loop', fireCalc: 'No', cFIREsim: 'No', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Spending guardrails', ours: 'Multi-tier drawdown-based', fireCalc: 'No', cFIREsim: 'No', fidelity: 'No', pviz: 'No' },
  { feature: 'Healthcare costs', ours: '3-phase (pre-Medicare/Medicare/late)', fireCalc: 'No', cFIREsim: 'No', fidelity: 'Basic', pviz: 'No' },
  { feature: 'Cash buffer / bucket', ours: 'Yes (auto-refill in up markets)', fireCalc: 'No', cFIREsim: 'No', fidelity: 'No', pviz: 'No' },
  { feature: 'Employer match', ours: 'Yes (rate + cap + Roth split)', fireCalc: 'No', cFIREsim: 'No', fidelity: 'Yes', pviz: 'No' },
  { feature: 'One-time expenses', ours: 'Yes (inflation-adjustable)', fireCalc: 'Yes', cFIREsim: 'Yes', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Inflation modeling', ours: 'Separate: spending, tax, medical, SS', fireCalc: 'Historical CPI', cFIREsim: 'Historical CPI', fidelity: 'Assumed rate', pviz: 'Assumed rate' },
  { feature: 'Contribution limits', ours: '401k + IRA with catch-up', fireCalc: 'No', cFIREsim: 'No', fidelity: 'Yes', pviz: 'No' },
  { feature: 'Cost', ours: 'Free / self-hosted', fireCalc: 'Free', cFIREsim: 'Free (premium: FIREproof)', fidelity: 'Free (account required)', pviz: 'Free (limited) / paid' },
];

// ── Run ──────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('  RETIREMENT PLANNER – BENCHMARK COMPARISON');
console.log('  10,000 Monte Carlo simulations per scenario');
console.log('  Student-t(df=6) fat-tail returns (except where noted)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('─── PART 1: FEATURE COMPARISON ─────────────────────────────\n');

// Print feature table
const colW = [28, 30, 20, 20, 18, 18];
const headers = ['Feature', 'Ours', 'FireCalc', 'cFIREsim', 'Fidelity', 'PortfolioViz'];
console.log(headers.map((h, i) => h.padEnd(colW[i])).join('│'));
console.log(colW.map(w => '─'.repeat(w)).join('┼'));
for (const f of features) {
  const row = [f.feature, f.ours, f.fireCalc, f.cFIREsim, f.fidelity, f.pviz];
  console.log(row.map((v, i) => v.padEnd(colW[i])).join('│'));
}

console.log('\n─── PART 2: SUCCESS RATE VALIDATION ────────────────────────\n');

let allPassed = true;

for (const bm of benchmarks) {
  const result = runSimulation(bm.scenario, { numSimulations: SIMS, seed: SEED });
  const rate = result.successRate * 100;
  const [lo, hi] = bm.expectedRange;
  const inRange = rate >= lo && rate <= hi;
  const status = inRange ? '✓ PASS' : '✗ MISS';
  if (!inRange) allPassed = false;

  console.log(`${status}  ${bm.name}`);
  console.log(`       ${bm.description}`);
  console.log(`       Our result: ${rate.toFixed(1)}%    Expected: ${lo}-${hi}%    Source: ${bm.source}`);
  const endings = result.percentileBands[result.percentileBands.length - 1];
  console.log(`       Ending balance → P10: $${Math.round(endings.p10).toLocaleString()}  P50: $${Math.round(endings.p50).toLocaleString()}  P90: $${Math.round(endings.p90).toLocaleString()}`);
  console.log();
}

console.log('─── SUMMARY ─────────────────────────────────────────────────');
console.log(`  ${benchmarks.length} benchmarks run, ${allPassed ? 'ALL PASSED ✓' : 'SOME FAILED ✗'}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (!allPassed) process.exit(1);
