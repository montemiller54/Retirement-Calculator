import type {
  ScenarioInput, SimulationPath, YearResult,
  AccountBalances, AccountType,
  SimulationResult, PercentileBand, SimulationParams,
  SafeSpendingResult,
} from '../types';
import { ASSET_CLASSES, ACCOUNT_TYPES } from '../types';
import { PRNG, cholesky, generateCorrelatedReturns, blendedReturn, crashFrequencyToSteadyState } from './math';
import { DEFAULT_CORRELATION_MATRIX, BEAR_CORRELATION_MATRIX, DEFAULT_ASSET_RETURNS, BEAR_PERSISTENCE, BEAR_BOND_MEAN, POST_BEAR_RECOVERY_YEAR1_MEAN, POST_BEAR_RECOVERY_YEAR2_MEAN, MAX_BEAR_DURATION, QUALIFIED_DIVIDEND_YIELD } from '../constants/asset-classes';
import { allocateContributions } from './contributions';
import { executeWithdrawals } from './withdrawals';
import { estimateSSBenefit, getFullRetirementAgeMonths } from '../utils/social-security';
import { calculateTaxes, type TaxInput } from './tax';
import { getFederalBrackets, getStandardDeduction, getSSThresholds } from '../constants/tax';
import { getRmdStartAge } from '../constants/rmd-table';
import { getIrmaaMonthlySurcharge } from '../constants/irs-2026';
import { DEFAULT_401K_CATCHUP, DEFAULT_401K_SUPER_CATCHUP, DEFAULT_IRA_CATCHUP, DEFAULT_HSA_SELF_ONLY } from '../constants/contribution-limits';

function emptyBalances(): AccountBalances {
  return {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };
}

function sumBalances(b: AccountBalances): number {
  return ACCOUNT_TYPES.reduce((s, k) => s + b[k], 0);
}

// Spendable balance excludes HSA, which is reserved for qualified medical expenses
// only and never funds general spending. A path with only HSA left is considered depleted.
function sumSpendableBalances(b: AccountBalances): number {
  return ACCOUNT_TYPES.reduce((s, k) => s + (k === 'hsa' ? 0 : b[k]), 0);
}

function cloneBalances(b: AccountBalances): AccountBalances {
  return { ...b };
}

function getAllocation(scenario: ScenarioInput, account: AccountType, isRetired: boolean) {
  const phase = isRetired
    ? scenario.investments.postRetirement
    : scenario.investments.preRetirement;
  const alloc = phase[account];
  return ASSET_CLASSES.map(ac => alloc[ac] ?? 0);
}

// ── Resolve SS benefits: auto-estimate or use manual value ──
function resolveSSBenefits(s: ScenarioInput): ScenarioInput {
  if (s.socialSecurityMode !== 'auto') return s;

  // Use highest-paying job (including past jobs) for SS estimation
  const highestSalary = (s.jobs ?? []).length > 0
    ? Math.max(...(s.jobs ?? []).map(j => j.monthlyPay))
    : 0;

  // If no jobs exist, keep the current SS benefit value rather than zeroing it out
  if (highestSalary === 0 && s.socialSecurityBenefit > 0) return s;

  const ssBenefit = estimateSSBenefit(highestSalary, s.socialSecurityClaimAge, s.currentAge);

  // Spouse SS: use 50% of primary PIA as spousal benefit estimate
  const spouseBenefit = s.spouse?.enabled
    ? estimateSSBenefit(0, s.spouse.socialSecurityClaimAge, s.spouse.currentAge) || Math.round(ssBenefit * 0.5)
    : 0;

  return {
    ...s,
    socialSecurityBenefit: ssBenefit,
    spouse: s.spouse ? { ...s.spouse, socialSecurityBenefit: spouseBenefit } : s.spouse,
  };
}

// ── Convert monthly inputs to annual for the simulation loop ──
function toAnnualScenario(s: ScenarioInput): ScenarioInput {
  const resolved = resolveSSBenefits(s);
  // Derive tax bracket inflation from spending inflation minus 0.3% (chained CPI-U lag)
  const derivedTaxBracketRate = resolved.taxBracketInflationRate ?? Math.max(0, resolved.spendingInflationRate - 0.003);
  return {
    ...resolved,
    taxBracketInflationRate: derivedTaxBracketRate,
    jobs: (resolved.jobs ?? []).map(j => ({ ...j, monthlyPay: j.monthlyPay * 12 })),
    baseMonthlySpending: resolved.baseMonthlySpending * 12,
    socialSecurityBenefit: resolved.socialSecurityBenefit * 12,
    pensionAmount: resolved.pensionType === 'lumpSum' ? resolved.pensionAmount : resolved.pensionAmount * 12,
    spouse: resolved.spouse ? {
      ...resolved.spouse,
      socialSecurityBenefit: resolved.spouse.socialSecurityBenefit * 12,
    } : resolved.spouse,
    otherIncomeSources: resolved.otherIncomeSources.map(src => ({
      ...src,
      monthlyAmount: src.monthlyAmount * 12,
    })),
    guardrails: {
      ...resolved.guardrails,
    },
    healthcare: {
      ...resolved.healthcare,
      preMedicareMonthly: resolved.healthcare.preMedicareMonthly * 12,
      medicareMonthly: resolved.healthcare.medicareMonthly * 12,
      lateLifeMonthly: resolved.healthcare.lateLifeMonthly * 12,
    },
    housing: {
      ...(resolved.housing ?? { enabled: false, mortgagePayment: 0, payoffAge: 65, downsizingProceeds: 0, downsizingAge: 70 }),
      mortgagePayment: (resolved.housing?.mortgagePayment ?? 0) * 12,
    },
  };
}

// ── Per-year phase helpers for runSinglePath ──
// Each helper owns one phase of the year loop. All scenario values (`s`) are
// the ANNUALIZED scenario from toAnnualScenario.

interface RegimeState {
  inBear: boolean;
  bearDuration: number;          // consecutive bear years
  recoveryYearsRemaining: number; // post-bear recovery countdown
  lastBearDuration: number;       // length of the most recent bear (for boost sizing)
}

// Markov regime transition: bear markets cluster realistically, capped at
// MAX_BEAR_DURATION consecutive years. Returns this year's post-bear recovery
// boost mean (elevated stocks/crypto mean; bigger bear → bigger bounce).
function transitionRegime(state: RegimeState, rng: PRNG, yearsFromNow: number, enterBear: number): number | undefined {
  if (yearsFromNow > 0) {
    const wasBear = state.inBear;
    state.inBear = state.inBear
      ? (state.bearDuration < MAX_BEAR_DURATION && rng.next() < BEAR_PERSISTENCE)
      : rng.next() < enterBear;
    if (wasBear && !state.inBear) {
      // Bear → Bull transition: start recovery window (1-2 years)
      state.lastBearDuration = state.bearDuration;
      state.recoveryYearsRemaining = state.bearDuration >= 2 ? 2 : 1;
      state.bearDuration = 0;
    } else if (state.inBear) {
      state.bearDuration++;
      state.recoveryYearsRemaining = 0; // cancel recovery if we re-enter bear
    } else if (state.recoveryYearsRemaining > 0) {
      state.recoveryYearsRemaining--;
    }
  }
  if (!state.inBear && state.recoveryYearsRemaining > 0) {
    const isFirstRecoveryYear = (state.lastBearDuration >= 2 && state.recoveryYearsRemaining === 2) ||
                                (state.lastBearDuration === 1 && state.recoveryYearsRemaining === 1);
    const baseMean = isFirstRecoveryYear ? POST_BEAR_RECOVERY_YEAR1_MEAN : POST_BEAR_RECOVERY_YEAR2_MEAN;
    // Scale: 1-year bear gets ~70% of full boost; 3+ year bear gets 100%
    const scale = Math.min(1, 0.5 + 0.25 * state.lastBearDuration);
    return baseMean * scale;
  }
  return undefined;
}

// Each job is active when its owner's age falls within its own window.
// A regular job ends at the owner's retirementAge (retiring at N means the
// person is retired starting the year they turn N — no salary that year).
// Explicit post-retirement gigs (startAge >= retirementAge) are honored.
function computeJobIncome(s: ScenarioInput, age: number, spouseAge: number | null, yearsFromNow: number): {
  primarySalary: number; spouseSalary: number; activeJobs: ScenarioInput['jobs'];
} {
  const sp = s.spouse;
  let primarySalary = 0;
  let spouseSalary = 0;
  const activeJobs: ScenarioInput['jobs'] = [];
  for (const job of (s.jobs ?? [])) {
    let ownerAge: number;
    let ownerRetirementAge: number;
    if (job.owner === 'spouse') {
      if (!sp?.enabled || spouseAge === null) continue;
      ownerAge = spouseAge;
      ownerRetirementAge = sp.retirementAge;
    } else {
      ownerAge = age;
      ownerRetirementAge = s.retirementAge;
    }
    if (ownerAge < job.startAge || ownerAge > job.endAge) continue;
    // Cap regular jobs at retirement; allow explicit post-retirement gigs.
    const isPostRetirementGig = job.startAge >= ownerRetirementAge;
    if (!isPostRetirementGig && ownerAge >= ownerRetirementAge) continue;
    const jobSalary = job.monthlyPay * Math.pow(1 + s.salaryGrowthRate, yearsFromNow);
    if (job.owner === 'spouse') spouseSalary += jobSalary;
    else primarySalary += jobSalary;
    activeJobs.push(job);
  }
  return { primarySalary, spouseSalary, activeJobs };
}

// SS benefits for both spouses, indexed from today (benefits are entered in
// today's dollars), with the pre-FRA earnings test applied per person.
function computeSocialSecurityIncome(
  s: ScenarioInput, age: number, spouseAge: number | null, yearsFromNow: number,
  primarySalary: number, spouseSalary: number,
): { socialSecurity: number; spouseSS: number } {
  const sp = s.spouse;

  const ssClaiming = age >= s.socialSecurityClaimAge;
  let socialSecurity = ssClaiming
    ? s.socialSecurityBenefit * Math.pow(1 + s.socialSecurityCOLA, yearsFromNow)
    : 0;

  // Earnings test: before FRA, SS is reduced $1 per $2 earned above threshold
  const birthYear = new Date().getFullYear() - s.currentAge;
  const fraMonths = getFullRetirementAgeMonths(birthYear);
  const fraAge = Math.ceil(fraMonths / 12);
  if (socialSecurity > 0 && age < fraAge && primarySalary > 0) {
    // 2026 exempt amount (~$23,400, indexed)
    const ssEarningsExempt = 23400 * Math.pow(1 + (s.taxBracketInflationRate ?? 0.02), yearsFromNow);
    const excessEarnings = Math.max(0, primarySalary - ssEarningsExempt);
    socialSecurity -= Math.min(socialSecurity, excessEarnings * 0.5);
  }

  let spouseSS = 0;
  if (sp?.enabled && spouseAge !== null) {
    const spouseSsClaiming = spouseAge >= sp.socialSecurityClaimAge;
    spouseSS = spouseSsClaiming
      ? sp.socialSecurityBenefit * Math.pow(1 + s.socialSecurityCOLA, yearsFromNow)
      : 0;

    if (spouseSS > 0 && spouseSalary > 0) {
      const spouseBirthYear = new Date().getFullYear() - sp.currentAge;
      const spouseFraAge = Math.ceil(getFullRetirementAgeMonths(spouseBirthYear) / 12);
      if (spouseAge < spouseFraAge) {
        const ssEarningsExempt = 23400 * Math.pow(1 + (s.taxBracketInflationRate ?? 0.02), yearsFromNow);
        const excessEarnings = Math.max(0, spouseSalary - ssEarningsExempt);
        spouseSS -= Math.min(spouseSS, excessEarnings * 0.5);
      }
    }
  }

  return { socialSecurity, spouseSS };
}

// Pension income (annuity) or one-time lump-sum deposit into the chosen account.
function applyPension(s: ScenarioInput, age: number, isRetired: boolean, balances: AccountBalances): {
  pension: number; lumpSumTaxable: number; taxableBasisAdd: number;
} {
  let pension = 0;
  let lumpSumTaxable = 0;
  let taxableBasisAdd = 0;
  if (s.pensionType === 'lumpSum') {
    if (age === s.pensionStartAge && s.pensionAmount > 0) {
      const acct = s.pensionLumpSumAccount ?? 'traditionalIRA';
      balances[acct] += s.pensionAmount;
      if (acct === 'taxable') {
        taxableBasisAdd = s.pensionAmount;
        // Cash-out is taxed as ordinary income; IRA rollover is not
        lumpSumTaxable = s.pensionAmount;
      }
    }
  } else {
    const pensionActive = isRetired && age >= s.pensionStartAge && s.pensionAmount > 0;
    const pensionYears = pensionActive ? age - s.pensionStartAge : 0;
    pension = pensionActive
      ? s.pensionAmount * Math.pow(1 + s.pensionCOLA, pensionYears)
      : 0;
  }
  return { pension, lumpSumTaxable, taxableBasisAdd };
}

function computeOtherIncome(s: ScenarioInput, age: number, yearsFromNow: number): number {
  let otherIncome = 0;
  for (const src of s.otherIncomeSources) {
    if (age >= src.startAge && age <= src.endAge) {
      otherIncome += src.monthlyAmount * Math.pow(1 + src.inflationRate, yearsFromNow);
    }
  }
  return otherIncome;
}

// Contributions per owner: each owner gets their own 401k/IRA/HSA limits and
// earns employer match only from their own jobs. Mutates balances.
function applyContributions(
  s: ScenarioInput, age: number, spouseAge: number | null, yearsFromNow: number,
  activeJobs: ScenarioInput['jobs'], primarySalary: number, spouseSalary: number,
  balances: AccountBalances,
): { contributions: AccountBalances; employeePreTax401k: number; employeeHSA: number; taxableBasisAdd: number } {
  const sp = s.spouse;
  const salary = primarySalary + spouseSalary;
  const contributions = emptyBalances();
  let employeePreTax401k = 0; // for wage tax calculation
  let employeeHSA = 0;
  let taxableBasisAdd = 0;
  if (activeJobs.length > 0 && salary > 0) {
    const limIdx = Math.pow(1 + (s.taxBracketInflationRate ?? 0), yearsFromNow);

    const applyOwner = (ownerSalary: number, ownerJobs: typeof s.jobs, ownerAge: number) => {
      if (ownerSalary <= 0 || ownerJobs.length === 0) return;
      const totalSavings = ownerSalary * s.totalSavingsRate;

      let totalEmployerMatch = 0;
      let totalRothMatch = 0;
      for (const job of ownerJobs) {
        if (job.has401k && job.employerMatchRate > 0 && job.employerMatchCapPct > 0) {
          const jobSalary = job.monthlyPay * Math.pow(1 + s.salaryGrowthRate, yearsFromNow);
          const desired401k = totalSavings *
            ((s.contributionAllocation.traditional401k + s.contributionAllocation.roth401k) / 100);
          const matchableAmount = Math.min(desired401k, jobSalary * job.employerMatchCapPct);
          const jobMatch = matchableAmount * job.employerMatchRate;
          totalRothMatch += jobMatch * ((job.employerRothPct ?? 0) / 100);
          totalEmployerMatch += jobMatch;
        }
      }
      const weightedRothPct = totalEmployerMatch > 0 ? (totalRothMatch / totalEmployerMatch) * 100 : 0;

      const has401k = ownerJobs.some(j => j.has401k);
      const effectiveAllocation = { ...s.contributionAllocation };
      if (!has401k) {
        effectiveAllocation.taxable += effectiveAllocation.traditional401k + effectiveAllocation.roth401k;
        effectiveAllocation.traditional401k = 0;
        effectiveAllocation.roth401k = 0;
      }

      const result = allocateContributions({
        totalSavings,
        allocation: effectiveAllocation,
        age: ownerAge,
        limit401k: s.limit401k * limIdx,
        limitIRA: s.limitIRA * limIdx,
        enable401kCatchUp: s.enable401kCatchUp,
        enableIRACatchUp: s.enableIRACatchUp,
        employerMatch: totalEmployerMatch,
        employerRothPct: weightedRothPct,
        catchUp401k: DEFAULT_401K_CATCHUP * limIdx,
        superCatchUp401k: DEFAULT_401K_SUPER_CATCHUP * limIdx,
        catchUpIRA: DEFAULT_IRA_CATCHUP * limIdx,
        hsaLimit: DEFAULT_HSA_SELF_ONLY * limIdx,
      });

      employeePreTax401k += result.contributions.traditional401k;
      employeeHSA += result.contributions.hsa;

      for (const acct of ACCOUNT_TYPES) {
        contributions[acct] += result.contributions[acct];
        balances[acct] += result.contributions[acct];
        if (acct === 'taxable') {
          taxableBasisAdd += result.contributions[acct];
        }
      }
      for (const acct of ACCOUNT_TYPES) {
        if (result.employerContributions[acct] > 0) {
          contributions[acct] += result.employerContributions[acct];
          balances[acct] += result.employerContributions[acct];
        }
      }
    };

    applyOwner(
      primarySalary,
      activeJobs.filter(j => j.owner === 'primary'),
      age,
    );
    if (sp?.enabled && spouseAge !== null) {
      applyOwner(
        spouseSalary,
        activeJobs.filter(j => j.owner === 'spouse'),
        spouseAge,
      );
    }
  }
  return { contributions, employeePreTax401k, employeeHSA, taxableBasisAdd };
}

// Taxable-account investment income: the blended return already includes
// these; recharacterize the slice as currently-taxed income — qualified
// dividends (LTCG rates) on the stock portion, interest (ordinary) on
// bond/cash. Reinvested, so the caller adds both to cost basis.
function computeTaxableInvestmentIncome(
  scenario: ScenarioInput, balances: AccountBalances, isRetired: boolean, means: number[],
): { taxableDividends: number; taxableInterestIncome: number } {
  if (balances.taxable <= 0) return { taxableDividends: 0, taxableInterestIncome: 0 };
  const taxAlloc = getAllocation(scenario, 'taxable', isRetired);
  const stockPct = (taxAlloc[ASSET_CLASSES.indexOf('stocks')] ?? 0) / 100;
  const bondPct = (taxAlloc[ASSET_CLASSES.indexOf('bonds')] ?? 0) / 100;
  const cashPct = (taxAlloc[ASSET_CLASSES.indexOf('cash')] ?? 0) / 100;
  const bondMean = means[ASSET_CLASSES.indexOf('bonds')] ?? 0;
  const cashMean = means[ASSET_CLASSES.indexOf('cash')] ?? 0;
  return {
    taxableDividends: balances.taxable * stockPct * QUALIFIED_DIVIDEND_YIELD,
    taxableInterestIncome: balances.taxable * Math.max(0, bondPct * bondMean + cashPct * cashMean),
  };
}

// Roth conversion for the year: fixed amount or fill-to-bracket-ceiling.
// Moves money traditional → Roth IRA (mutates balances); returns the amount.
function executeRothConversionPhase(
  s: ScenarioInput, age: number, yearsFromNow: number, isRetired: boolean,
  balances: AccountBalances,
  income: { salary: number; pension: number; otherIncome: number; socialSecurity: number; spouseSS: number; taxableInterestIncome: number },
): number {
  if (!s.rothConversion?.enabled || age < s.rothConversion.startAge || age > s.rothConversion.endAge) return 0;
  const traditionalBalance = balances.traditional401k + balances.traditionalIRA;
  if (traditionalBalance <= 0) return 0;

  let conversionTarget = 0;
  if (s.rothConversion.strategy === 'fixedAmount') {
    conversionTarget = s.rothConversion.fixedAnnualAmount;
  } else {
    // fillBracket: compute "bracket room" = bracket ceiling - existing taxable ordinary income
    const idx = Math.pow(1 + (s.taxBracketInflationRate ?? 0), yearsFromNow);
    const brackets = getFederalBrackets(s.filingStatus ?? 'hoh');
    const stdDed = getStandardDeduction(s.filingStatus ?? 'hoh') * idx;
    const ssThresh = getSSThresholds(s.filingStatus ?? 'hoh');

    // Existing ordinary income (before conversion)
    const ordinaryExSS = income.salary + income.pension + income.otherIncome + income.taxableInterestIncome;
    // Estimate SS taxable portion for bracket room calc
    // (SS thresholds are statutorily frozen — not indexed)
    const totalSS = income.socialSecurity + income.spouseSS;
    const provisionalIncome = ordinaryExSS + totalSS * 0.5;
    let estSSTaxable = 0;
    if (totalSS > 0 && provisionalIncome > ssThresh.low) {
      estSSTaxable = Math.min(0.85 * totalSS,
        provisionalIncome > ssThresh.high
          ? 0.5 * (ssThresh.high - ssThresh.low) + 0.85 * (provisionalIncome - ssThresh.high)
          : 0.5 * (provisionalIncome - ssThresh.low));
      estSSTaxable = Math.max(0, Math.min(estSSTaxable, 0.85 * totalSS));
    }
    const existingOrdinary = ordinaryExSS + estSSTaxable;

    // Estimate traditional withdrawal for spending so the conversion doesn't
    // consume bracket room that spending withdrawals will also need.
    let estTradWithdrawal = 0;
    if (isRetired) {
      const estSpending = s.baseMonthlySpending * Math.pow(1 + s.spendingInflationRate, yearsFromNow);
      const estIncome = income.socialSecurity + income.spouseSS + income.pension + income.otherIncome;
      const estCashNeed = Math.max(0, estSpending - estIncome);
      // Non-traditional accounts are tapped first in most strategies
      const nonTradAvail = balances.cashAccount + balances.otherAssets + balances.taxable;
      estTradWithdrawal = Math.max(0, estCashNeed - nonTradAvail);
    }

    // Find bracket ceiling for the target rate
    const targetRate = s.rothConversion.targetBracketRate;
    let bracketCeiling = 0;
    for (const b of brackets) {
      if (b.rate <= targetRate) {
        bracketCeiling = (b.max === Infinity ? b.min : b.max) * idx;
      }
    }
    // Bracket room = gross income to fill bracket = ceiling + deduction - existing income - est withdrawals
    const grossCeiling = bracketCeiling + stdDed;
    conversionTarget = Math.max(0, grossCeiling - existingOrdinary - estTradWithdrawal);
  }

  // Actually convert: min(target, available traditional balance)
  const rothConversionAmount = Math.min(conversionTarget, traditionalBalance);
  if (rothConversionAmount > 0) {
    // Pull proportionally from traditional401k and traditionalIRA
    const pct401k = balances.traditional401k / traditionalBalance;
    const from401k = rothConversionAmount * pct401k;
    const fromIRA = rothConversionAmount - from401k;
    balances.traditional401k -= from401k;
    balances.traditionalIRA -= fromIRA;
    balances.rothIRA += rothConversionAmount;
  }
  return rothConversionAmount;
}

// ── Early-withdrawal penalty tracking (path-scoped state) ──
// 10% penalty on Traditional 401k/IRA withdrawals before 59.5; Rule of 55
// exempts the 401k at 55+. Roth IRA follows IRS ordering: contribution basis
// (penalty-free) → conversions oldest-first (penalized only if < 5 years old)
// → earnings (penalized). A conversion itself is never penalized.
interface RothPenaltyTracker {
  /** Penalizable portion of a Roth IRA withdrawal; consume=true permanently
   *  uses up basis/conversion layers (call once per year). */
  walk(age: number, amount: number, consume: boolean): number;
  /** Total penalizable amount for the year's withdrawals. */
  calcPenalty(age: number, w: AccountBalances): number;
}

function makeRothPenaltyTracker(s: ScenarioInput, conversionLedger: Map<number, number>): RothPenaltyTracker {
  let basisRemaining = Math.max(0, s.rothContributionBasis);

  const walk = (age: number, amount: number, consume: boolean): number => {
    let remaining = amount;
    let penalized = 0;
    const fromBasis = Math.min(remaining, basisRemaining);
    remaining -= fromBasis;
    if (consume) basisRemaining -= fromBasis;
    const convAges = [...conversionLedger.keys()].sort((a, b) => a - b);
    for (const convAge of convAges) {
      if (remaining <= 0) break;
      const layerAmt = conversionLedger.get(convAge)!;
      const take = Math.min(remaining, layerAmt);
      if (age - convAge < 5) penalized += take;
      remaining -= take;
      if (consume) {
        if (take >= layerAmt) conversionLedger.delete(convAge);
        else conversionLedger.set(convAge, layerAmt - take);
      }
    }
    penalized += remaining; // beyond basis and all conversion layers = earnings
    return penalized;
  };

  const calcPenalty = (age: number, w: AccountBalances): number => {
    if (age >= 60) return 0; // 59.5 — using 60 as annual approximation
    let penalizable = 0;
    const rule55 = s.ruleof55Eligible && age >= 55;
    if (w.traditional401k > 0 && !rule55) {
      penalizable += w.traditional401k;
    }
    penalizable += w.traditionalIRA;
    // Roth 401k basis/earnings split isn't tracked; treated as penalty-free.
    if (w.rothIRA > 0) {
      penalizable += walk(age, w.rothIRA, false);
    }
    return penalizable;
  };

  return { walk, calcPenalty };
}

interface GuardrailState {
  highWaterMark: number;
  currentSpendingAdjustment: number;
}

interface YearIncome {
  salary: number;
  socialSecurity: number;
  spouseSS: number;
  pension: number;
  pensionLumpSumTaxable: number;
  otherIncome: number;
  rothConversionAmount: number;
  taxableDividends: number;
  taxableInterestIncome: number;
  activeJobCount: number;
  employeePreTax401k: number;
  employeeHSA: number;
}

// Retirement-year spending: base (inflated, guardrail-adjusted) + one-time
// expenses + fixed-nominal mortgage + healthcare with IRMAA. Mutates balances
// (downsizing deposit, HSA-first healthcare payment) and withdrawals.hsa.
function computeRetirementSpending(
  s: ScenarioInput, age: number, spouseAge: number | null, yearsFromNow: number,
  yearInflationFactor: number, balances: AccountBalances, withdrawals: AccountBalances,
  guard: GuardrailState, magiHistory: number[], income: YearIncome,
): { spending: number; taxableBasisAdd: number } {
  const sp = s.spouse;
  let taxableBasisAdd = 0;
  let baseSpending = s.baseMonthlySpending * yearInflationFactor;

  // Housing: downsizing proceeds deposited at the chosen age
  if (s.housing?.enabled) {
    if (age === s.housing.downsizingAge && s.housing.downsizingProceeds > 0) {
      // Downsizing proceeds appreciate at inflation + 1% (historical real home appreciation)
      const homeAppreciation = s.spendingInflationRate + 0.01;
      const proceeds = s.housing.downsizingProceeds * Math.pow(1 + homeAppreciation, yearsFromNow);
      balances.taxable += proceeds;
      taxableBasisAdd += proceeds;
    }
  }

  // One-time expenses
  for (const exp of s.oneTimeExpenses) {
    if (exp.age === age) {
      const inflatedAmount = exp.inflationAdjusted
        ? exp.amount * Math.pow(1 + s.spendingInflationRate, yearsFromNow)
        : exp.amount;
      baseSpending += inflatedAmount;
    }
  }

  // Guardrails
  if (s.guardrails?.enabled) {
    const currentTotal = sumBalances(balances);
    guard.highWaterMark = Math.max(guard.highWaterMark, currentTotal);
    const drawdownPct = guard.highWaterMark > 0
      ? ((guard.highWaterMark - currentTotal) / guard.highWaterMark) * 100
      : 0;

    // Recompute adjustment fresh each year — allows recovery when portfolio rebounds
    let yearAdjustment = 1.0;
    const sortedTiers = [...s.guardrails.tiers].sort((a, b) => b.drawdownPct - a.drawdownPct);
    for (const tier of sortedTiers) {
      if (drawdownPct >= tier.drawdownPct) {
        yearAdjustment = Math.max(1 - tier.spendingCutPct / 100, 0.5);
        break;
      }
    }
    guard.currentSpendingAdjustment = yearAdjustment;

    baseSpending *= guard.currentSpendingAdjustment;
  }

  let spending = baseSpending;

  // Mortgage P&I: constant nominal (never inflated) and contractual — no guardrail cuts
  if (s.housing?.enabled && age < s.housing.payoffAge) {
    spending += s.housing.mortgagePayment;
  }

  // ── Healthcare costs (non-discretionary, not subject to guardrails) ──
  if (s.healthcare?.enabled) {
    const hc = s.healthcare;
    let annualHealthcare: number;
    if (age < hc.medicareStartAge) {
      annualHealthcare = hc.preMedicareMonthly; // already annualized
    } else if (age < hc.lateLifeStartAge) {
      annualHealthcare = hc.medicareMonthly;
    } else {
      annualHealthcare = hc.lateLifeMonthly;
    }
    // Inflate from current age (today's dollars) by medical inflation
    annualHealthcare *= Math.pow(1 + hc.inflationRate, yearsFromNow);

    // IRMAA: Medicare premium surcharges based on MAGI from TWO years prior.
    // For the first two sim years (no history yet), estimate from current income.
    const personsOnMedicare =
      (age >= hc.medicareStartAge ? 1 : 0) +
      (sp?.enabled && spouseAge !== null && spouseAge >= hc.medicareStartAge ? 1 : 0);
    if (personsOnMedicare > 0) {
      let magiLookback: number;
      if (magiHistory.length >= 2) {
        magiLookback = magiHistory[magiHistory.length - 2];
      } else if (magiHistory.length === 1) {
        magiLookback = magiHistory[0];
      } else {
        magiLookback = income.salary + income.pension + income.otherIncome + income.rothConversionAmount +
          income.taxableInterestIncome + income.taxableDividends + 0.85 * (income.socialSecurity + income.spouseSS);
      }
      const thresholdIdx = Math.pow(1 + (s.taxBracketInflationRate ?? 0), yearsFromNow);
      const surchargeMonthly = getIrmaaMonthlySurcharge(magiLookback, s.filingStatus ?? 'hoh', thresholdIdx);
      // Premiums grow faster than CPI — use medical inflation
      annualHealthcare += surchargeMonthly * 12 * personsOnMedicare * Math.pow(1 + hc.inflationRate, yearsFromNow);
    }

    // Pay healthcare from HSA first (tax-free qualified medical use), then portfolio
    if (balances.hsa > 0 && annualHealthcare > 0) {
      const hsaUsed = Math.min(balances.hsa, annualHealthcare);
      balances.hsa -= hsaUsed;
      withdrawals.hsa += hsaUsed;
      annualHealthcare -= hsaUsed;
    }
    spending += annualHealthcare;
  }

  return { spending, taxableBasisAdd };
}

// Gross traditional withdrawal that keeps ordinary income at or below the
// top of the 12% bracket (taxEfficient strategy only).
function computeBracketFillLimit(s: ScenarioInput, yearsFromNow: number, income: YearIncome): number | undefined {
  if (s.withdrawalStrategy !== 'taxEfficient') return undefined;
  const idx = Math.pow(1 + (s.taxBracketInflationRate ?? 0), yearsFromNow);
  const brackets = getFederalBrackets(s.filingStatus ?? 'hoh');
  const stdDed = getStandardDeduction(s.filingStatus ?? 'hoh') * idx;
  const ssThresh = getSSThresholds(s.filingStatus ?? 'hoh');
  // Existing ordinary income excluding SS (wages, pension, other, Roth conv)
  const wagesTaxable = (income.activeJobCount > 0 && income.salary > 0)
    ? income.salary - income.employeePreTax401k - income.employeeHSA : income.salary;
  const ordinaryExSS = wagesTaxable + income.pension + income.pensionLumpSumTaxable +
    income.otherIncome + income.rothConversionAmount + income.taxableInterestIncome;
  // Estimate SS taxable portion (SS thresholds are statutorily frozen — not indexed)
  const totalSS = income.socialSecurity + income.spouseSS;
  const provisionalIncome = ordinaryExSS + totalSS * 0.5;
  let estSSTaxable = 0;
  if (totalSS > 0 && provisionalIncome > ssThresh.low) {
    estSSTaxable = provisionalIncome > ssThresh.high
      ? 0.5 * (ssThresh.high - ssThresh.low) + 0.85 * (provisionalIncome - ssThresh.high)
      : 0.5 * (provisionalIncome - ssThresh.low);
    estSSTaxable = Math.max(0, Math.min(estSSTaxable, 0.85 * totalSS));
  }
  const existingOrdinary = ordinaryExSS + estSSTaxable;

  // Top of 12% bracket for this filing status, indexed
  let twelvePctCeiling = 0;
  for (const b of brackets) {
    if (b.rate === 0.12) { twelvePctCeiling = b.max * idx; break; }
  }
  // Traditional room = gross income needed to hit the ceiling
  // = (12% bracket top on taxable income) + std deduction - existing ordinary
  return Math.max(0, twelvePctCeiling + stdDed - existingOrdinary);
}

// Income-tax wages are net of pre-tax 401k + HSA; FICA wages are gross minus
// HSA only (401k deferrals remain FICA-taxable). Employer match affects neither.
function buildYearTaxInput(
  s: ScenarioInput, age: number, yearsFromNow: number,
  income: YearIncome, traditionalWithdrawals: number, capitalGains: number,
  penaltyAmount: number,
): TaxInput {
  return {
    wages: (income.activeJobCount > 0 && income.salary > 0)
      ? income.salary - income.employeePreTax401k - income.employeeHSA : income.salary,
    ficaWages: income.salary > 0 ? income.salary - income.employeeHSA : 0,
    traditionalWithdrawals,
    socialSecurity: income.socialSecurity + income.spouseSS,
    pension: income.pension + income.pensionLumpSumTaxable,
    capitalGains: capitalGains + income.taxableDividends,
    taxableInterest: income.taxableInterestIncome,
    otherTaxableIncome: income.otherIncome,
    age,
    filingStatus: s.filingStatus,
    stateCode: s.stateCode,
    yearsFromNow,
    taxBracketInflationRate: s.taxBracketInflationRate ?? 0,
    earlyWithdrawalPenaltyAmount: penaltyAmount,
  };
}

// Iterative tax-aware withdrawal: withdraw enough to cover spending + taxes
// on those withdrawals; the tax on traditional draws creates additional cash
// need, so iterate to converge (within $100). Mutates balances/withdrawals.
function convergeWithdrawalsAndTaxes(p: {
  s: ScenarioInput; age: number; yearsFromNow: number;
  spending: number; incomeFromSources: number; initialCashNeed: number;
  balances: AccountBalances; withdrawals: AccountBalances; taxableCostBasis: number;
  priorYearEnd401k: number; priorYearEndIRA: number; rmdStartAge: number;
  traditionalBracketFillLimit: number | undefined;
  income: YearIncome; penalty: RothPenaltyTracker;
}): { capitalGains: number; rmdAmount: number; taxableCostBasis: number } {
  const { s, age, balances, withdrawals } = p;
  let taxableCostBasis = p.taxableCostBasis;
  let totalCashNeed = p.initialCashNeed;
  let capitalGains = 0;
  let rmdAmount = 0;

  // Save balance snapshot for iteration
  const balanceSnapshot = cloneBalances(balances);
  const costBasisSnapshot = taxableCostBasis;

  for (let iter = 0; iter < 5; iter++) {
    // Reset balances to snapshot for each iteration
    for (const acct of ACCOUNT_TYPES) balances[acct] = balanceSnapshot[acct];
    taxableCostBasis = costBasisSnapshot;

    const costBasisPct = balances.taxable > 0 ? taxableCostBasis / balances.taxable : 0;

    const wResult = executeWithdrawals({
      cashNeed: totalCashNeed,
      balances,
      strategy: s.withdrawalStrategy,
      age,
      priorYearTraditionalBalance: p.priorYearEnd401k + p.priorYearEndIRA,
      priorYear401kBalance: p.priorYearEnd401k,
      priorYearIRABalance: p.priorYearEndIRA,
      taxableCostBasisPct: Math.min(1, Math.max(0, costBasisPct)),
      rmdStartAge: p.rmdStartAge,
      traditionalBracketFillLimit: p.traditionalBracketFillLimit,
    });

    for (const acct of ACCOUNT_TYPES) {
      withdrawals[acct] = wResult.withdrawals[acct];
      balances[acct] = Math.max(0, balanceSnapshot[acct] - wResult.withdrawals[acct]);
    }

    // Update taxable cost basis
    if (withdrawals.taxable > 0 && balanceSnapshot.taxable > 0) {
      const withdrawnBasis = costBasisSnapshot * (withdrawals.taxable / balanceSnapshot.taxable);
      taxableCostBasis = Math.max(0, costBasisSnapshot - withdrawnBasis);
    }

    capitalGains = wResult.capitalGains;
    rmdAmount = wResult.rmdAmount;

    // Excess RMD goes to taxable
    if (wResult.excessRMD > 0) {
      balances.taxable += wResult.excessRMD;
      taxableCostBasis += wResult.excessRMD;
    }

    // Estimate taxes on these withdrawals
    const tradW = withdrawals.traditional401k + withdrawals.traditionalIRA;
    const iterPenaltyAmount = p.penalty.calcPenalty(age, withdrawals);
    const iterTax = calculateTaxes(buildYearTaxInput(
      s, age, p.yearsFromNow, p.income,
      tradW + p.income.rothConversionAmount, capitalGains, iterPenaltyAmount,
    ));

    const newCashNeed = Math.max(0, p.spending + iterTax.total - p.incomeFromSources);
    // If converged (within $100), break
    if (Math.abs(newCashNeed - totalCashNeed) < 100) {
      totalCashNeed = newCashNeed;
      break;
    }
    totalCashNeed = newCashNeed;
  }

  return { capitalGains, rmdAmount, taxableCostBasis };
}

// ── Run a single simulation path ──
function runSinglePath(scenario: ScenarioInput, rng: PRNG, bullCholeskyL: number[][], bearCholeskyL: number[][]): SimulationPath {
  const s = toAnnualScenario(scenario);
  const years: YearResult[] = [];
  const balances = cloneBalances(s.balances);
  let taxableCostBasis = balances.taxable * s.taxableCostBasisPct;

  const means = ASSET_CLASSES.map(ac => (s.investments.assetClassReturns[ac] ?? DEFAULT_ASSET_RETURNS[ac]).mean);
  const stdDevs = ASSET_CLASSES.map(ac => (s.investments.assetClassReturns[ac] ?? DEFAULT_ASSET_RETURNS[ac]).stdDev);

  // Bear-year bond mean boost (flight to quality + rate cuts)
  const bearMeans = [...means];
  const bondIdx = ASSET_CLASSES.indexOf('bonds');
  if (bondIdx >= 0) bearMeans[bondIdx] = BEAR_BOND_MEAN;

  // Stocks & crypto use regime-switching (bull/bear); bonds & cash stay Gaussian
  const regimeMask = ASSET_CLASSES.map(ac => ac === 'stocks' || ac === 'crypto');

  // Markov regime state: bear probability from crash frequency slider
  const bearSteadyState = crashFrequencyToSteadyState(s.investments.crashFrequency);
  const enterBear = bearSteadyState * (1 - BEAR_PERSISTENCE) / (1 - bearSteadyState);
  const startInBear = rng.next() < bearSteadyState; // start from steady-state
  const regime: RegimeState = {
    inBear: startInBear,
    bearDuration: startInBear ? 1 : 0,
    recoveryYearsRemaining: 0,
    lastBearDuration: 0,
  };

  let depleted = false;
  let depletionAge: number | null = null;
  const guard: GuardrailState = {
    highWaterMark: sumBalances(balances),
    currentSpendingAdjustment: 1.0,
  };

  // Roth 5-year rule: track conversion amounts by year (age)
  // Converted amounts can't be withdrawn penalty-free until 5 years later
  const rothConversionsByAge: Map<number, number> = new Map();
  const rothPenalty = makeRothPenaltyTracker(s, rothConversionsByAge);

  // Track prior-year-end traditional balances for RMD (IRS uses Dec 31 balance of prior year)
  let priorYearEnd401k = balances.traditional401k;
  let priorYearEndIRA = balances.traditionalIRA;

  // SECURE 2.0: RMDs begin at 73 (born ≤1959) or 75 (born ≥1960)
  const rmdStartAge = getRmdStartAge(new Date().getFullYear() - s.currentAge);

  // Cumulative inflation factor — compounds year over year with random variation
  let cumulativeInflationFactor = 1.0;

  // Per-year MAGI history for the IRMAA two-year lookback
  const magiHistory: number[] = [];

  for (let age = s.currentAge; age <= s.endAge; age++) {
    const spouseAge = s.spouse?.enabled ? s.spouse.currentAge + (age - s.currentAge) : null;
    // Drawdown and allocation phases both track the primary's retirement,
    // which is when withdrawals begin.
    const isRetired = age >= s.retirementAge;
    const yearsFromNow = age - s.currentAge;

    // ── Generate returns for this year ──
    const recoveryBoost = transitionRegime(regime, rng, yearsFromNow, enterBear);
    const choleskyL = regime.inBear ? bearCholeskyL : bullCholeskyL;
    const yearMeans = regime.inBear ? bearMeans : means;
    const assetReturns = generateCorrelatedReturns(rng, choleskyL, yearMeans, stdDevs, regime.inBear, regimeMask, recoveryBoost);

    // ── Variable inflation for this year ──
    // Compound inflation year by year; if volatility > 0, randomize each year's rate
    let yearInflationFactor: number;
    if (yearsFromNow === 0) {
      cumulativeInflationFactor = 1.0;
    } else if (s.inflationVolatility > 0) {
      const noise = rng.nextGaussian() * s.inflationVolatility;
      const yearRate = Math.max(0, s.spendingInflationRate + noise);
      cumulativeInflationFactor *= (1 + yearRate);
    } else {
      cumulativeInflationFactor *= (1 + s.spendingInflationRate);
    }
    yearInflationFactor = cumulativeInflationFactor;

    // ── Income phases ──
    const { primarySalary, spouseSalary, activeJobs } = computeJobIncome(s, age, spouseAge, yearsFromNow);
    const salary = primarySalary + spouseSalary;

    const { socialSecurity, spouseSS } = computeSocialSecurityIncome(s, age, spouseAge, yearsFromNow, primarySalary, spouseSalary);

    const pensionResult = applyPension(s, age, isRetired, balances);
    const pension = pensionResult.pension;
    const pensionLumpSumTaxable = pensionResult.lumpSumTaxable;
    taxableCostBasis += pensionResult.taxableBasisAdd;

    const otherIncome = computeOtherIncome(s, age, yearsFromNow);

    const totalIncome = salary + socialSecurity + spouseSS + pension + otherIncome;

    // ── Contributions (per owner) ──
    const contribResult = applyContributions(s, age, spouseAge, yearsFromNow, activeJobs, primarySalary, spouseSalary, balances);
    const { contributions, employeePreTax401k, employeeHSA } = contribResult;
    taxableCostBasis += contribResult.taxableBasisAdd;

    // ── Taxable-account investment income (dividends & interest) ──
    const { taxableDividends, taxableInterestIncome } = computeTaxableInvestmentIncome(scenario, balances, isRetired, means);
    taxableCostBasis += taxableDividends + taxableInterestIncome;

    // ── Roth Conversion ──
    const rothConversionAmount = executeRothConversionPhase(s, age, yearsFromNow, isRetired, balances,
      { salary, pension, otherIncome, socialSecurity, spouseSS, taxableInterestIncome });
    if (rothConversionAmount > 0) {
      // Track for Roth 5-year rule
      rothConversionsByAge.set(age, (rothConversionsByAge.get(age) || 0) + rothConversionAmount);
    }

    // ── Spending & withdrawals (retirement) ──
    let spending = 0;
    const withdrawals = emptyBalances();
    let capitalGains = 0;
    let rmdAmount = 0;

    const income: YearIncome = {
      salary, socialSecurity, spouseSS, pension, pensionLumpSumTaxable,
      otherIncome, rothConversionAmount, taxableDividends, taxableInterestIncome,
      activeJobCount: activeJobs.length, employeePreTax401k, employeeHSA,
    };

    if (isRetired) {
      const spendResult = computeRetirementSpending(
        s, age, spouseAge, yearsFromNow, yearInflationFactor,
        balances, withdrawals, guard, magiHistory, income,
      );
      spending = spendResult.spending;
      taxableCostBasis += spendResult.taxableBasisAdd;

      // Salary is counted net of the savings-rate portion, which has already been
      // diverted into contributions above and isn't available to fund spending.
      const netSalaryCash = salary > 0 ? salary * (1 - s.totalSavingsRate) : 0;
      const incomeFromSources = socialSecurity + spouseSS + pension + otherIncome + netSalaryCash;
      const initialCashNeed = Math.max(0, spending - incomeFromSources);

      const traditionalBracketFillLimit = computeBracketFillLimit(s, yearsFromNow, income);

      // RMDs must be taken even when income fully covers spending
      const rmdIsDue = age >= rmdStartAge && (priorYearEnd401k + priorYearEndIRA) > 0;

      if ((initialCashNeed > 0 || rothConversionAmount > 0 || rmdIsDue) && !depleted) {
        const wr = convergeWithdrawalsAndTaxes({
          s, age, yearsFromNow,
          spending, incomeFromSources, initialCashNeed,
          balances, withdrawals, taxableCostBasis,
          priorYearEnd401k, priorYearEndIRA, rmdStartAge,
          traditionalBracketFillLimit,
          income, penalty: rothPenalty,
        });
        capitalGains = wr.capitalGains;
        rmdAmount = wr.rmdAmount;
        taxableCostBasis = wr.taxableCostBasis;
      }
    }

    // ── Taxes ──
    const traditionalWithdrawals = withdrawals.traditional401k + withdrawals.traditionalIRA + rothConversionAmount;
    const penaltyAmount = isRetired ? rothPenalty.calcPenalty(age, withdrawals) : 0;
    const taxResult = calculateTaxes(buildYearTaxInput(
      s, age, yearsFromNow, income, traditionalWithdrawals, capitalGains, penaltyAmount,
    ));

    // Record MAGI for future IRMAA lookbacks
    magiHistory.push(taxResult.agi);

    // Consume Roth IRA basis/conversion layers actually withdrawn this year
    if (withdrawals.rothIRA > 0) {
      rothPenalty.walk(age, withdrawals.rothIRA, true);
    }

    // ── Surplus income reinvestment ──
    // When retirement income exceeds spending + taxes, reinvest surplus into taxable.
    // Use the same net-salary figure the withdrawal loop used so both sides agree.
    if (isRetired && !depleted) {
      const netSalary = salary > 0 ? salary * (1 - s.totalSavingsRate) : 0;
      const retirementIncome = socialSecurity + spouseSS + pension + otherIncome + netSalary;
      const surplus = retirementIncome - spending - taxResult.total;
      if (surplus > 0) {
        balances.taxable += surplus;
        taxableCostBasis += surplus;
      }
    }

    // ── Apply returns ──
    let totalReturn = 0;
    if (!depleted) {
      for (const acct of ACCOUNT_TYPES) {
        if (balances[acct] <= 0) continue;
        const allocPcts = getAllocation(scenario, acct, isRetired);
        const ret = blendedReturn(assetReturns, allocPcts);
        const gain = balances[acct] * ret;
        balances[acct] += gain;
        balances[acct] = Math.max(0, balances[acct]);
        totalReturn += gain;

        // Taxable account: gains add to balance but not to cost basis
        // (cost basis stays the same → unrealized gains grow)
      }
    }

    // Update high water mark
    const totalBal = sumBalances(balances);
    if (!isRetired) guard.highWaterMark = totalBal;

    // Check depletion against spendable balance (excludes HSA, which can only be
    // used for qualified medical expenses). A path with $0 spendable is failed even
    // if HSA still has a balance.
    const spendableBal = sumSpendableBalances(balances);
    if (isRetired && spendableBal < 100 && !depleted) {
      depleted = true;
      depletionAge = age;
      // Zero out remaining balances (including HSA, since the household has no
      // way to fund living expenses regardless of HSA balance)
      for (const acct of ACCOUNT_TYPES) balances[acct] = 0;
    }

    years.push({
      age,
      totalBalance: sumBalances(balances),
      balances: cloneBalances(balances),
      income: {
        salary,
        socialSecurity: socialSecurity + spouseSS,
        pension,
        other: otherIncome,
        total: totalIncome,
      },
      spending,
      contributions: { ...contributions },
      withdrawals: { ...withdrawals },
      taxes: {
        federal: taxResult.federal,
        state: taxResult.state,
        capitalGains: taxResult.capitalGains,
        fica: taxResult.fica,
        total: taxResult.total,
      },
      investmentReturn: totalReturn,
      rmdAmount,
      rothConversionAmount,
      depleted,
    });

    // Capture year-end traditional balances for next year's RMD
    priorYearEnd401k = balances.traditional401k;
    priorYearEndIRA = balances.traditionalIRA;
  }

  const endingBalance = sumBalances(balances);
  return {
    years,
    endingBalance,
    success: !depleted,
    depletionAge,
  };
}

// ── Aggregate results across all simulations ──
// Year-by-year mean across a set of paths, including per-account maps.
// Used for the median band, worst decile, and full-population averages.
function averagePathYears(subset: SimulationPath[], numYears: number): YearResult[] {
  const count = subset.length;
  const out: YearResult[] = [];
  for (let yi = 0; yi < numYears; yi++) {
    const base = subset[0].years[yi];
    const avg: YearResult = {
      ...base,
      totalBalance: 0,
      income: { salary: 0, socialSecurity: 0, pension: 0, other: 0, total: 0 },
      spending: 0,
      taxes: { federal: 0, state: 0, capitalGains: 0, fica: 0, total: 0 },
      investmentReturn: 0,
      rmdAmount: 0,
      rothConversionAmount: 0,
      balances: emptyBalances(),
      contributions: emptyBalances(),
      withdrawals: emptyBalances(),
      depleted: false,
    };
    for (const p of subset) {
      const yr = p.years[yi];
      avg.totalBalance += yr.totalBalance;
      avg.spending += yr.spending;
      avg.investmentReturn += yr.investmentReturn;
      avg.rmdAmount += yr.rmdAmount;
      avg.rothConversionAmount += yr.rothConversionAmount;
      avg.income.salary += yr.income.salary;
      avg.income.socialSecurity += yr.income.socialSecurity;
      avg.income.pension += yr.income.pension;
      avg.income.other += yr.income.other;
      avg.income.total += yr.income.total;
      avg.taxes.federal += yr.taxes.federal;
      avg.taxes.state += yr.taxes.state;
      avg.taxes.capitalGains += yr.taxes.capitalGains;
      avg.taxes.fica += yr.taxes.fica;
      avg.taxes.total += yr.taxes.total;
      for (const acct of ACCOUNT_TYPES) {
        avg.balances[acct] += yr.balances[acct];
        avg.contributions[acct] += yr.contributions[acct];
        avg.withdrawals[acct] += yr.withdrawals[acct];
      }
    }
    avg.totalBalance /= count;
    avg.spending /= count;
    avg.investmentReturn /= count;
    avg.rmdAmount /= count;
    avg.rothConversionAmount /= count;
    avg.income.salary /= count;
    avg.income.socialSecurity /= count;
    avg.income.pension /= count;
    avg.income.other /= count;
    avg.income.total /= count;
    avg.taxes.federal /= count;
    avg.taxes.state /= count;
    avg.taxes.capitalGains /= count;
    avg.taxes.fica /= count;
    avg.taxes.total /= count;
    for (const acct of ACCOUNT_TYPES) {
      avg.balances[acct] /= count;
      avg.contributions[acct] /= count;
      avg.withdrawals[acct] /= count;
    }
    avg.depleted = avg.totalBalance <= 0;
    out.push(avg);
  }
  return out;
}

function aggregateResults(paths: SimulationPath[], _scenario: ScenarioInput): SimulationResult {
  const n = paths.length;
  const successCount = paths.filter(p => p.success).length;
  const numYears = paths[0].years.length;

  // Percentile bands
  const percentileBands: PercentileBand[] = [];
  for (let yi = 0; yi < numYears; yi++) {
    const age = paths[0].years[yi].age;
    const values = paths.map(p => p.years[yi].totalBalance).sort((a, b) => a - b);
    percentileBands.push({
      age,
      p10: values[Math.floor(n * 0.10)],
      p25: values[Math.floor(n * 0.25)],
      p50: values[Math.floor(n * 0.50)],
      p75: values[Math.floor(n * 0.75)],
      p90: values[Math.floor(n * 0.90)],
    });
  }

  // Ending balances
  const endingBalances = paths.map(p => p.endingBalance).sort((a, b) => a - b);

  const sortedByEnding = [...paths].sort((a, b) => a.endingBalance - b.endingBalance);

  // Median path (smoothed: average of paths between p45 and p55)
  const medianBandPaths = sortedByEnding.slice(Math.floor(n * 0.45), Math.floor(n * 0.55) + 1);
  const medianPath = averagePathYears(medianBandPaths, numYears);

  // Worst decile path (average of bottom 10%)
  const worstPaths = sortedByEnding.slice(0, Math.max(1, Math.floor(n * 0.10)));
  const worstDecilePath = averagePathYears(worstPaths, numYears);

  // Average path (mean across ALL simulations)
  const averagePath = averagePathYears(paths, numYears);

  return {
    successRate: successCount / n,
    percentileBands,
    endingBalances,
    medianPath,
    averagePath,
    expectedPath: medianPath, // placeholder, overwritten by runSimulation
    worstDecilePath,
    depletionAges: paths.map(p => p.depletionAge),
  };
}

// ── Main entry point ──
export function runSimulation(
  scenario: ScenarioInput,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
): SimulationResult {
  const seed = params.seed ?? Date.now();
  const rng = new PRNG(seed);
  const bullCholeskyL = cholesky(DEFAULT_CORRELATION_MATRIX);
  const bearCholeskyL = cholesky(BEAR_CORRELATION_MATRIX);

  const paths: SimulationPath[] = [];
  for (let i = 0; i < params.numSimulations; i++) {
    paths.push(runSinglePath(scenario, rng, bullCholeskyL, bearCholeskyL));
    if (onProgress && (i % 50 === 0 || i === params.numSimulations - 1)) {
      onProgress(i + 1, params.numSimulations);
    }
  }

  // Run one deterministic path using mean returns (zero volatility, no guardrails)
  const deterministicScenario: ScenarioInput = {
    ...scenario,
    inflationVolatility: 0,
    guardrails: { ...scenario.guardrails, enabled: false },
    investments: {
      ...scenario.investments,
      assetClassReturns: Object.fromEntries(
        Object.entries(scenario.investments.assetClassReturns).map(
          ([k, v]) => [k, { mean: v.mean, stdDev: 0 }]
        )
      ) as ScenarioInput['investments']['assetClassReturns'],
    },
  };
  const deterministicRng = new PRNG(0);
  const expectedPath = runSinglePath(deterministicScenario, deterministicRng, bullCholeskyL, bearCholeskyL).years;

  const result = aggregateResults(paths, scenario);
  return { ...result, expectedPath };
}

// ── Safe spending solver ──
// Binary-search over monthly spending to find the level that achieves the target success rate.
// Guardrails are disabled so the result represents a fixed-spending safe level.
// Uses 1,000 simulations for search iterations and 5,000 for the final answer.
export function findSafeSpending(
  scenario: ScenarioInput,
  targetSuccessRate: number,
  onProgress?: (completed: number, total: number) => void,
): SafeSpendingResult {
  const SEARCH_SIMS = 2000;
  const FINAL_SIMS = 5000;
  const MAX_ITER = 20;
  const TOLERANCE = 25; // $25/month convergence tolerance

  // Disable guardrails for the search — we want a fixed-spending answer
  const baseScenario: ScenarioInput = {
    ...scenario,
    guardrails: { ...scenario.guardrails, enabled: false },
  };

  // Use multiple seeds and average results to eliminate seed-specific bias.
  // Each call runs the same set of seeds for consistent binary search comparisons.
  const baseSeed = Date.now();
  const NUM_SEEDS = 5;
  const bullCholeskyL = cholesky(DEFAULT_CORRELATION_MATRIX);
  const bearCholeskyL = cholesky(BEAR_CORRELATION_MATRIX);

  // Helper: run simulation across multiple seeds and return averaged success rate
  const getSuccessRate = (monthlySpending: number, numSims: number): number => {
    const testScenario: ScenarioInput = {
      ...baseScenario,
      baseMonthlySpending: monthlySpending,
    };
    const simsPerSeed = Math.ceil(numSims / NUM_SEEDS);
    let totalSuccesses = 0;
    let totalRuns = 0;
    for (let s = 0; s < NUM_SEEDS; s++) {
      const rng = new PRNG(baseSeed + s * 7919); // spread seeds with a prime offset
      for (let i = 0; i < simsPerSeed; i++) {
        const path = runSinglePath(testScenario, rng, bullCholeskyL, bearCholeskyL);
        if (path.success) totalSuccesses++;
        totalRuns++;
      }
    }
    return totalSuccesses / totalRuns;
  };

  // Estimate total steps for progress reporting
  const totalSteps = MAX_ITER + 1; // search iterations + final run
  let currentStep = 0;

  // Set search bounds (monthly amounts in today's dollars)
  let low = 0;
  let high = scenario.baseMonthlySpending * 5; // 5x current spending as upper bound
  // If current spending is 0 or very small, use a reasonable upper bound
  if (high < 1000) high = 20000;

  // Ensure the upper bound actually fails (success rate < target)
  let highRate = getSuccessRate(high, SEARCH_SIMS);
  currentStep++;
  if (onProgress) onProgress(currentStep, totalSteps);
  while (highRate >= targetSuccessRate && high < 100000) {
    high *= 2;
    highRate = getSuccessRate(high, SEARCH_SIMS);
    currentStep++;
    if (onProgress) onProgress(Math.min(currentStep, totalSteps - 1), totalSteps);
  }

  // Binary search
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const mid = Math.round((low + high) / 2);
    if (high - low < TOLERANCE) break;

    const rate = getSuccessRate(mid, SEARCH_SIMS);
    currentStep++;
    if (onProgress) onProgress(Math.min(currentStep, totalSteps - 1), totalSteps);

    if (rate >= targetSuccessRate) {
      low = mid; // can spend more
    } else {
      high = mid; // need to spend less
    }
  }

  // Use the lower bound (conservative — guaranteed to meet target)
  const safeMonthly = low;

  // Final run at full 5,000 simulations for accurate success rate
  const finalRate = getSuccessRate(safeMonthly, FINAL_SIMS);
  if (onProgress) onProgress(totalSteps, totalSteps);

  return {
    monthlySpending: safeMonthly,
    annualSpending: safeMonthly * 12,
    targetSuccessRate,
    achievedSuccessRate: finalRate,
  };
}

// Calibration utility: samples raw per-year blended portfolio returns by running
// stripped paths and computing year-over-year balance growth. Used by calibration
// tests to verify that user-configured asset means/stdDevs actually propagate
// through the engine. Caller must pass a scenario with no spending/contributions
// /taxes/inflation so balance changes reflect investment return alone.
export function sampleBlendedReturns(
  scenario: ScenarioInput,
  options: { numPaths: number; seed: number },
): number[] {
  const rng = new PRNG(options.seed);
  const bullL = cholesky(DEFAULT_CORRELATION_MATRIX);
  const bearL = cholesky(BEAR_CORRELATION_MATRIX);
  const out: number[] = [];
  for (let p = 0; p < options.numPaths; p++) {
    const path = runSinglePath(scenario, rng, bullL, bearL);
    for (let y = 1; y < path.years.length; y++) {
      const prev = path.years[y - 1].totalBalance;
      const curr = path.years[y].totalBalance;
      if (prev > 0) out.push(curr / prev - 1);
    }
  }
  return out;
}
