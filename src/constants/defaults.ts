import type { ScenarioInput, AssetClass } from '../types';
import { ASSET_CLASSES } from '../types';
import { RISK_PROFILES, makeUniformAllocations, RETURN_OUTLOOK_PRESETS, DEFAULT_VOLATILITY } from './asset-classes';
import { DEFAULT_401K_LIMIT, DEFAULT_IRA_LIMIT } from './contribution-limits';

/** Build assetClassReturns from an outlook preset (means) + hardcoded volatility. */
export function buildAssetClassReturns(
  means: Record<AssetClass, number>,
): Record<AssetClass, { mean: number; stdDev: number }> {
  const out = {} as Record<AssetClass, { mean: number; stdDev: number }>;
  for (const ac of ASSET_CLASSES) {
    out[ac] = { mean: means[ac], stdDev: DEFAULT_VOLATILITY[ac] };
  }
  return out;
}

const DEFAULT_OUTLOOK = RETURN_OUTLOOK_PRESETS.moderate;

export const DEFAULT_SCENARIO: ScenarioInput = {
  name: 'Default Scenario',

  // Profile
  currentAge: 35,
  retirementAge: 65,
  endAge: 95,
  filingStatus: 'hoh',
  stateCode: 'IA',

  // Jobs & Earnings (monthly amounts)
  jobs: [
    {
      id: 'default-job',
      name: 'Primary Job',
      monthlyPay: 8333,
      startAge: 35,
      endAge: 65,
      has401k: true,
      employerMatchRate: 0,
      employerMatchCapPct: 0,
      employerRothPct: 0,
    },
  ],
  salaryGrowthRate: 0.03,
  totalSavingsRate: 0.20,
  contributionAllocation: {
    traditional401k: 50,
    roth401k: 0,
    traditionalIRA: 0,
    rothIRA: 20,
    taxable: 30,
    hsa: 0,
    cashAccount: 0,
    otherAssets: 0,
  },

  // Contribution limits
  enable401kCatchUp: false,
  enableIRACatchUp: false,
  limit401k: DEFAULT_401K_LIMIT,
  limitIRA: DEFAULT_IRA_LIMIT,

  // Portfolio
  balances: {
    traditional401k: 50000,
    roth401k: 0,
    traditionalIRA: 0,
    rothIRA: 20000,
    taxable: 30000,
    hsa: 0,
    cashAccount: 0,
    otherAssets: 0,
  },
  visibleAccounts: ['traditional401k', 'cashAccount'],
  taxableCostBasisPct: 0.80,

  // Spending (monthly amounts)
  baseAnnualSpending: 5000,
  spendingInflationRate: 0.025,
  taxBracketInflationRate: 0.02,
  oneTimeExpenses: [],

  // Income sources (monthly amounts)
  socialSecurityMode: 'auto',
  socialSecurityBenefit: 2000,
  socialSecurityClaimAge: 67,
  socialSecurityCOLA: 0.02,
  pensionAmount: 0,
  pensionStartAge: 65,
  pensionCOLA: 0.0,
  pensionType: 'annuity',
  pensionLumpSumAccount: 'traditionalIRA',
  otherIncomeSources: [],

  // Investments
  investments: {
    mode: 'simple',
    riskProfile: 'balanced',
    returnOutlook: 'moderate',
    preRetirement: makeUniformAllocations(RISK_PROFILES.balanced),
    postRetirement: makeUniformAllocations(RISK_PROFILES.conservative),
    assetClassReturns: buildAssetClassReturns(DEFAULT_OUTLOOK.means),
    crashFrequency: DEFAULT_OUTLOOK.crashFrequency,
  },

  // Withdrawal
  withdrawalStrategy: 'taxEfficient',

  // Early withdrawal settings
  ruleof55Eligible: false,
  rothContributionBasis: 0,

  // Housing / mortgage
  housing: {
    enabled: false,
    mortgagePayment: 1500,
    payoffAge: 65,
    downsizingProceeds: 0,
    downsizingAge: 70,
  },

  // Variable inflation
  inflationVolatility: 0.015,

  // Guardrails
  guardrails: {
    enabled: false,
    tiers: [
      { drawdownPct: 15, spendingCutPct: 10 },
    ],
  },

  // Healthcare
  healthcare: {
    enabled: false,
    preMedicareMonthly: 1500,
    medicareMonthly: 500,
    lateLifeMonthly: 1000,
    medicareStartAge: 65,
    lateLifeStartAge: 80,
    inflationRate: 0.05,
  },

  // Roth conversions
  rothConversion: {
    enabled: false,
    strategy: 'fillBracket',
    targetBracketRate: 0.12,
    fixedAnnualAmount: 50000,
    startAge: 65,
    endAge: 72,
  },

  // Cash buffer
  cashBuffer: {
    enabled: false,
    yearsOfExpenses: 3,
    refillInUpMarkets: true,
  },

  // Spouse
  spouse: {
    enabled: false,
    currentAge: 33,
    socialSecurityBenefit: 1500,
    socialSecurityClaimAge: 67,
  },
};
