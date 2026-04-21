import type { ScenarioInput } from '../types';
import { RISK_PROFILES, makeUniformAllocations, DEFAULT_ASSET_RETURNS, DEFAULT_FAT_TAIL_DF } from './asset-classes';
import { DEFAULT_401K_LIMIT, DEFAULT_IRA_LIMIT } from './contribution-limits';

export const DEFAULT_SCENARIO: ScenarioInput = {
  name: 'Default Scenario',

  // Profile
  currentAge: 35,
  retirementAge: 65,
  endAge: 95,
  filingStatus: 'hoh',
  stateCode: 'IA',

  // Earnings (monthly amounts)
  currentSalary: 8333,
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

  // Employer match
  employerMatchRate: 0,        // 0 = no employer match
  employerMatchCapPct: 0,
  employerRothPct: 0,          // 100% of match goes to Traditional 401k by default

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
  otherIncomeSources: [],

  // Investments
  investments: {
    mode: 'simple',
    riskProfile: 'balanced',
    preRetirement: makeUniformAllocations(RISK_PROFILES.balanced),
    postRetirement: makeUniformAllocations(RISK_PROFILES.conservative),
    assetClassReturns: { ...DEFAULT_ASSET_RETURNS },
    fatTailDf: DEFAULT_FAT_TAIL_DF,
  },

  // Withdrawal
  withdrawalStrategy: 'taxEfficient',

  // Early withdrawal settings
  ruleof55Eligible: false,
  rothContributionBasis: 0,

  // Part-time retirement income
  partTimeIncome: {
    enabled: false,
    monthlyAmount: 2000,
    endAge: 70,
  },

  // Housing / mortgage
  housing: {
    enabled: false,
    mortgagePayment: 1500,
    payoffAge: 65,
    downsizingProceeds: 0,
    downsizingAge: 70,
  },

  // Variable inflation
  inflationVolatility: 0,

  // Guardrails
  guardrails: {
    enabled: false,
    tiers: [
      { drawdownPct: 15, spendingCutPct: 10 },
    ],
    minimumSpendingFloor: 2500,
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
    retirementAge: 65,
    currentSalary: 0,
    salaryGrowthRate: 0.03,
    socialSecurityBenefit: 1500,
    socialSecurityClaimAge: 67,
    pensionAmount: 0,
    pensionStartAge: 65,
    pensionCOLA: 0.0,
  },
};
