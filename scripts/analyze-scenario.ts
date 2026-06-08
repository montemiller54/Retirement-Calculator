import { runSimulation } from '../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../src/constants/defaults';
import type { ScenarioInput } from '../src/types';

const scenario: ScenarioInput = {
  ...DEFAULT_SCENARIO,
  name: '11kAt55',
  currentAge: 48,
  retirementAge: 55,
  endAge: 95,
  filingStatus: 'mfj',
  stateCode: 'IA',
  jobs: [{
    id: 'migrated-primary', name: 'Primary Job', monthlyPay: 25600,
    startAge: 48, endAge: 55, has401k: true,
    employerMatchRate: 1.55, employerMatchCapPct: 0.06, employerRothPct: 0,
  }],
  salaryGrowthRate: 0.015,
  totalSavingsRate: 0.10,
  contributionAllocation: {
    traditional401k: 33, roth401k: 66, traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 1, cashAccount: 0, otherAssets: 0,
  },
  enable401kCatchUp: false,
  enableIRACatchUp: false,
  limit401k: 24500,
  limitIRA: 7500,
  balances: {
    traditional401k: 790000, roth401k: 400000, traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 8000, cashAccount: 0, otherAssets: 0,
  },
  visibleAccounts: ['traditional401k', 'roth401k', 'hsa', 'otherAssets'],
  taxableCostBasisPct: 0.5,
  baseAnnualSpending: 9000,
  spendingInflationRate: 0.025,
  taxBracketInflationRate: 0.02,
  oneTimeExpenses: [],
  socialSecurityMode: 'auto',
  socialSecurityBenefit: 0,
  socialSecurityClaimAge: 62,
  socialSecurityCOLA: 0.025,
  pensionAmount: 4600,
  pensionStartAge: 62,
  pensionCOLA: 0,
  pensionType: 'annuity',
  pensionLumpSumAccount: 'traditionalIRA',
  otherIncomeSources: [],
  investments: {
    mode: 'advanced',
    riskProfile: 'aggressive',
    preRetirement: {
      traditional401k: { stocks: 70, bonds: 30, cash: 0, crypto: 0 },
      roth401k: { stocks: 70, bonds: 30, cash: 0, crypto: 0 },
      traditionalIRA: { stocks: 80, bonds: 15, cash: 5, crypto: 0 },
      rothIRA: { stocks: 80, bonds: 15, cash: 5, crypto: 0 },
      taxable: { stocks: 80, bonds: 15, cash: 5, crypto: 0 },
      hsa: { stocks: 80, bonds: 15, cash: 5, crypto: 0 },
      cashAccount: { stocks: 80, bonds: 15, cash: 5, crypto: 0 },
      otherAssets: { stocks: 0, bonds: 0, cash: 0, crypto: 100 },
    },
    postRetirement: {
      traditional401k: { stocks: 60, bonds: 40, cash: 0, crypto: 0 },
      roth401k: { stocks: 60, bonds: 40, cash: 0, crypto: 0 },
      traditionalIRA: { stocks: 60, bonds: 30, cash: 10, crypto: 0 },
      rothIRA: { stocks: 60, bonds: 30, cash: 10, crypto: 0 },
      taxable: { stocks: 60, bonds: 30, cash: 10, crypto: 0 },
      hsa: { stocks: 60, bonds: 30, cash: 10, crypto: 0 },
      cashAccount: { stocks: 60, bonds: 30, cash: 10, crypto: 0 },
      otherAssets: { stocks: 0, bonds: 0, cash: 0, crypto: 100 },
    },
    assetClassReturns: {
      stocks: { mean: 0.08, stdDev: 0.16 },
      bonds: { mean: 0.045, stdDev: 0.06 },
      cash: { mean: 0.025, stdDev: 0.01 },
      crypto: { mean: 0.12, stdDev: 0.40 },
    },
    crashFrequency: 9,
  },
  withdrawalStrategy: 'taxEfficient',
  ruleof55Eligible: true,
  rothContributionBasis: 0,
  housing: {
    enabled: true, mortgagePayment: 2000, payoffAge: 52,
    downsizingProceeds: 0, downsizingAge: 86,
  },
  inflationVolatility: 0,
  guardrails: {
    enabled: false,
    tiers: [
      { drawdownPct: 20, spendingCutPct: 20 },
      { drawdownPct: 30, spendingCutPct: 30 },
      { drawdownPct: 40, spendingCutPct: 40 },
    ],
    minimumSpendingFloor: 0,
  },
  healthcare: {
    enabled: false, preMedicareMonthly: 700, medicareMonthly: 500,
    lateLifeMonthly: 8000, medicareStartAge: 65, lateLifeStartAge: 90, inflationRate: 0.033,
  },
  rothConversion: {
    enabled: false, strategy: 'fixedAmount', targetBracketRate: 0.12,
    fixedAnnualAmount: 50000, startAge: 65, endAge: 72,
  },
  cashBuffer: { enabled: false, yearsOfExpenses: 1, refillInUpMarkets: true },
  spouse: {
    enabled: true, currentAge: 47, socialSecurityBenefit: 0,
    socialSecurityClaimAge: 62, retirementAge: 62, currentSalary: 0,
    salaryGrowthRate: 0.03, pensionAmount: 0, pensionStartAge: 65, pensionCOLA: 0,
  },
};

const N = 2000;

console.log('Running simulations at different crash frequencies...\n');

for (const cf of [1, 3, 5.5, 7, 9, 10]) {
  const s = { ...scenario, investments: { ...scenario.investments, crashFrequency: cf } };
  const result = runSimulation(s, { numSimulations: N, seed: 42 });
  const median10 = result.medianPath.find(y => y.age === 65);
  const median20 = result.medianPath.find(y => y.age === 75);
  console.log(`cf=${cf.toString().padStart(4)}: success=${(result.successRate * 100).toFixed(1).padStart(5)}%  ` +
    `medianEnd=$${(result.medianEnding / 1000).toFixed(0)}K  ` +
    `p10End=$${((result as any).percentiles?.[0]?.ending / 1000 || 0).toFixed(0)}K  ` +
    `median@65=$${median10 ? (median10.totalBalance / 1000).toFixed(0) + 'K' : 'n/a'}  ` +
    `median@75=$${median20 ? (median20.totalBalance / 1000).toFixed(0) + 'K' : 'n/a'}`
  );
}

// Detailed look at cf=9 (user's setting) vs cf=5.5 (historical default)
console.log('\n--- Detailed comparison: cf=5.5 (historical) vs cf=9 (your setting) ---\n');

for (const cf of [5.5, 9]) {
  const s = { ...scenario, investments: { ...scenario.investments, crashFrequency: cf } };
  const result = runSimulation(s, { numSimulations: N, seed: 42 });
  
  console.log(`\ncf=${cf} (${cf === 5.5 ? 'historical default' : 'your setting'}):`);
  console.log(`  Success rate: ${(result.successRate * 100).toFixed(1)}%`);
  console.log(`  Median ending balance: $${(result.medianEnding / 1000).toFixed(0)}K`);
  console.log(`  Median path (key ages):`);
  
  for (const age of [55, 60, 62, 65, 70, 75, 80, 85, 90, 95]) {
    const yr = result.medianPath.find(y => y.age === age);
    if (yr) {
      console.log(`    Age ${age}: balance=$${(yr.totalBalance / 1000).toFixed(0)}K  spending=$${(yr.spending / 1000).toFixed(1)}K  income=$${((yr.socialSecurity + yr.pension) / 1000).toFixed(1)}K`);
    }
  }
}
