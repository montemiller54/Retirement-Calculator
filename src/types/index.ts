// ── Filing status ──
export type FilingStatus = 'mfj' | 'hoh' | 'single';

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  mfj: 'Married Filing Jointly',
  hoh: 'Head of Household',
  single: 'Single',
};

// ── Account types ──
export type AccountType =
  | 'traditional401k'
  | 'roth401k'
  | 'traditionalIRA'
  | 'rothIRA'
  | 'taxable'
  | 'hsa'
  | 'cashAccount'
  | 'otherAssets';

export const ACCOUNT_TYPES: AccountType[] = [
  'traditional401k',
  'roth401k',
  'traditionalIRA',
  'rothIRA',
  'taxable',
  'hsa',
  'cashAccount',
  'otherAssets',
];

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  traditional401k: '401(k) Traditional',
  roth401k: '401(k) Roth',
  traditionalIRA: 'Traditional IRA',
  rothIRA: 'Roth IRA',
  taxable: 'Taxable Brokerage',
  hsa: 'Health Savings Acct',
  cashAccount: 'Cash Account',
  otherAssets: 'Other Assets',
};

// ── Asset classes ──
export type AssetClass = 'stocks' | 'bonds' | 'cash' | 'crypto';

export const ASSET_CLASSES: AssetClass[] = [
  'stocks',
  'bonds',
  'cash',
  'crypto',
];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stocks: 'Stocks',
  bonds: 'Bonds',
  cash: 'Cash',
  crypto: 'Crypto',
};

// ── Allocation types ──
export type AssetAllocation = Record<AssetClass, number>; // percentages summing to 100
export type AccountAllocations = Record<AccountType, AssetAllocation>;

// ── Risk profiles ──
export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

// ── Withdrawal strategies ──
export type WithdrawalStrategy =
  | 'taxEfficient'
  | 'rothPreserving'
  | 'proRata';

export const WITHDRAWAL_STRATEGY_LABELS: Record<WithdrawalStrategy, string> = {
  taxEfficient: 'Tax-Efficient Default',
  rothPreserving: 'Roth-Preserving',
  proRata: 'Pro-Rata',
};

// ── Contribution allocation ──
export type ContributionAllocation = Record<AccountType, number>; // percentages summing to 100

// ── Income source ──
export interface IncomeSource {
  id: string;
  name: string;
  annualAmount: number;
  startAge: number;
  endAge: number;
  inflationRate: number;
}

// ── One-time expense ──
export interface OneTimeExpense {
  id: string;
  name: string;
  amount: number;
  age: number;
  inflationAdjusted: boolean;
}

// ── Guardrail tier ──
export interface GuardrailTier {
  drawdownPct: number;
  spendingCutPct: number;
}

// ── Guardrail config ──
export interface GuardrailConfig {
  enabled: boolean;
  tiers: GuardrailTier[];
  minimumSpendingFloor: number; // in today's dollars, 0 = no floor
}

// ── Healthcare costs ──
export interface HealthcareCosts {
  enabled: boolean;
  preMedicareMonthly: number;   // monthly cost, retirement age to medicareStartAge-1
  medicareMonthly: number;      // monthly cost, medicareStartAge to lateLifeStartAge-1
  lateLifeMonthly: number;      // monthly cost, lateLifeStartAge+
  medicareStartAge: number;     // default 65
  lateLifeStartAge: number;     // default 80
  inflationRate: number;        // medical inflation, e.g. 0.05 for 5%
}

// ── Cash buffer strategy ──
export interface CashBufferConfig {
  enabled: boolean;
  yearsOfExpenses: number;      // target buffer size (e.g., 3 = 3× annual spending)
  refillInUpMarkets: boolean;   // refill buffer when market return is positive
}

// ── Spouse config ──
export interface SpouseConfig {
  enabled: boolean;
  currentAge: number;
  retirementAge: number;       // age spouse stops working
  currentSalary: number;       // monthly
  salaryGrowthRate: number;
  socialSecurityBenefit: number; // monthly at claim age
  socialSecurityClaimAge: number;
  pensionAmount: number;       // monthly
  pensionStartAge: number;
  pensionCOLA: number;
}

// ── Roth conversion config ──
export type RothConversionStrategy = 'fillBracket' | 'fixedAmount';

export interface RothConversion {
  enabled: boolean;
  strategy: RothConversionStrategy;
  targetBracketRate: number;    // e.g. 0.12 for "fill to top of 12%"
  fixedAnnualAmount: number;    // annual amount for fixedAmount strategy
  startAge: number;
  endAge: number;
}

// ── Asset class assumptions ──
export interface AssetClassAssumption {
  mean: number;   // annual nominal return (e.g., 0.10 for 10%)
  stdDev: number; // annual volatility
}

// ── Investment assumptions ──
export interface InvestmentAssumptions {
  mode: 'simple' | 'advanced';
  riskProfile: RiskProfile;
  preRetirement: AccountAllocations;
  postRetirement: AccountAllocations;
  assetClassReturns: Record<AssetClass, AssetClassAssumption>;
  fatTailDf: number; // degrees of freedom for Student-t
}

// ── Account balances ──
export type AccountBalances = Record<AccountType, number>;

// ── Main scenario input ──
export interface ScenarioInput {
  name: string;

  // Profile
  currentAge: number;
  retirementAge: number;
  endAge: number;
  filingStatus: FilingStatus;
  stateCode: string;              // 2-letter state code (e.g. 'IA')

  // Earnings
  currentSalary: number;
  salaryGrowthRate: number;      // e.g., 0.03
  totalSavingsRate: number;      // e.g., 0.20
  contributionAllocation: ContributionAllocation;

  // Employer match
  employerMatchRate: number;     // e.g., 1.0 for 100% match
  employerMatchCapPct: number;   // e.g., 0.06 for "up to 6% of salary"
  employerRothPct: number;       // 0-100, % of employer match to Roth 401k (rest → Trad 401k)

  // Contribution limits
  enable401kCatchUp: boolean;
  enableIRACatchUp: boolean;
  limit401k: number;
  limitIRA: number;

  // Current portfolio
  balances: AccountBalances;
  taxableCostBasisPct: number;   // e.g., 0.70 means 70% is basis

  // Spending
  baseAnnualSpending: number;    // today's dollars
  spendingInflationRate: number; // e.g., 0.025
  taxBracketInflationRate: number; // e.g., 0.02 — annual indexing of tax brackets
  oneTimeExpenses: OneTimeExpense[];

  // Income sources
  socialSecurityMode: 'auto' | 'manual'; // auto estimates from salary
  socialSecurityBenefit: number;  // monthly at claiming age (used when mode=manual)
  socialSecurityClaimAge: number;
  socialSecurityCOLA: number;     // e.g., 0.02
  pensionAmount: number;
  pensionStartAge: number;
  pensionCOLA: number;
  otherIncomeSources: IncomeSource[];

  // Investments
  investments: InvestmentAssumptions;

  // Withdrawal
  withdrawalStrategy: WithdrawalStrategy;

  // Guardrails
  guardrails: GuardrailConfig;

  // Healthcare
  healthcare: HealthcareCosts;

  // Roth conversions
  rothConversion: RothConversion;

  // Cash buffer
  cashBuffer: CashBufferConfig;

  // Spouse
  spouse: SpouseConfig;
}

// ── Simulation parameters ──
export interface SimulationParams {
  numSimulations: number;
  seed?: number;
}

// ── Per-year result for a single simulation ──
export interface YearResult {
  age: number;
  totalBalance: number;
  balances: AccountBalances;
  income: {
    salary: number;
    socialSecurity: number;
    pension: number;
    other: number;
    total: number;
  };
  spending: number;
  contributions: AccountBalances;
  withdrawals: AccountBalances;
  taxes: {
    federal: number;
    state: number;
    capitalGains: number;
    fica: number;
    total: number;
  };
  investmentReturn: number;
  rmdAmount: number;
  rothConversionAmount: number;
  depleted: boolean;
}

// ── Single simulation path ──
export interface SimulationPath {
  years: YearResult[];
  endingBalance: number;
  success: boolean;
  depletionAge: number | null;
}

// ── Percentile band data ──
export interface PercentileBand {
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

// ── Aggregated simulation result ──
export interface SimulationResult {
  successRate: number;
  percentileBands: PercentileBand[];
  endingBalances: number[];
  medianPath: YearResult[];
  averagePath: YearResult[];
  worstDecilePath: YearResult[];
  depletionAges: (number | null)[];
}

// ── Worker messages ──
export interface WorkerRequest {
  type: 'run';
  scenario: ScenarioInput;
  params: SimulationParams;
}

export interface WorkerProgress {
  type: 'progress';
  completed: number;
  total: number;
}

export interface WorkerComplete {
  type: 'complete';
  result: SimulationResult;
}

export interface WorkerError {
  type: 'error';
  message: string;
}

export type WorkerMessage = WorkerProgress | WorkerComplete | WorkerError;

// ── Scenario storage ──
export interface SavedScenario {
  id: string;
  name: string;
  input: ScenarioInput;
  savedAt: string;
}
