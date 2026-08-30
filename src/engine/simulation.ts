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
    baseAnnualSpending: resolved.baseAnnualSpending * 12,
    socialSecurityBenefit: resolved.socialSecurityBenefit * 12,
    pensionAmount: resolved.pensionType === 'lumpSum' ? resolved.pensionAmount : resolved.pensionAmount * 12,
    spouse: resolved.spouse ? {
      ...resolved.spouse,
      socialSecurityBenefit: resolved.spouse.socialSecurityBenefit * 12,
    } : resolved.spouse,
    otherIncomeSources: resolved.otherIncomeSources.map(src => ({
      ...src,
      annualAmount: src.annualAmount * 12,
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
  let inBearRegime = rng.next() < bearSteadyState; // start from steady-state
  let bearDuration = inBearRegime ? 1 : 0; // consecutive bear years
  let recoveryYearsRemaining = 0; // post-bear recovery countdown
  let lastBearDuration = 0; // length of the most recent bear (for boost sizing)

  let depleted = false;
  let depletionAge: number | null = null;
  let highWaterMark = sumBalances(balances);
  let currentSpendingAdjustment = 1.0; // for guardrails

  // Roth 5-year rule: track conversion amounts by year (age)
  // Converted amounts can't be withdrawn penalty-free until 5 years later
  const rothConversionsByAge: Map<number, number> = new Map();
  // Roth IRA contribution basis — withdrawn first, penalty-free, consumed as used
  let rothBasisRemaining = Math.max(0, s.rothContributionBasis);

  // Track prior-year-end traditional balances for RMD (IRS uses Dec 31 balance of prior year)
  let priorYearEnd401k = balances.traditional401k;
  let priorYearEndIRA = balances.traditionalIRA;

  // SECURE 2.0: RMDs begin at 73 (born ≤1959) or 75 (born ≥1960)
  const rmdStartAge = getRmdStartAge(new Date().getFullYear() - s.currentAge);

  // Cumulative inflation factor — compounds year over year with random variation
  let cumulativeInflationFactor = 1.0;

  for (let age = s.currentAge; age <= s.endAge; age++) {
    const sp = s.spouse;
    const spouseAge = sp?.enabled ? sp.currentAge + (age - s.currentAge) : null;
    const primaryRetired = age >= s.retirementAge;
    // Drawdown and allocation phases both track the primary's retirement,
    // which is when withdrawals begin.
    const isRetired = primaryRetired;
    const yearsFromNow = age - s.currentAge;

    // ── Generate returns for this year ──
    // Markov regime transition: bear markets cluster realistically, capped
    // at MAX_BEAR_DURATION consecutive years to match historical limits.
    if (yearsFromNow > 0) {
      const wasBear = inBearRegime;
      inBearRegime = inBearRegime
        ? (bearDuration < MAX_BEAR_DURATION && rng.next() < BEAR_PERSISTENCE)
        : rng.next() < enterBear;
      if (wasBear && !inBearRegime) {
        // Bear → Bull transition: start recovery window (1-2 years)
        lastBearDuration = bearDuration;
        recoveryYearsRemaining = bearDuration >= 2 ? 2 : 1;
        bearDuration = 0;
      } else if (inBearRegime) {
        bearDuration++;
        recoveryYearsRemaining = 0; // cancel recovery if we re-enter bear
      } else if (recoveryYearsRemaining > 0) {
        recoveryYearsRemaining--;
      }
    }
    const choleskyL = inBearRegime ? bearCholeskyL : bullCholeskyL;
    const yearMeans = inBearRegime ? bearMeans : means;
    let recoveryBoost: number | undefined;
    if (!inBearRegime && recoveryYearsRemaining > 0) {
      // Post-bear recovery: elevated mean for stocks/crypto.
      // Bigger bear → bigger bounce (scaled by lastBearDuration).
      const isFirstRecoveryYear = (lastBearDuration >= 2 && recoveryYearsRemaining === 2) ||
                                  (lastBearDuration === 1 && recoveryYearsRemaining === 1);
      const baseMean = isFirstRecoveryYear ? POST_BEAR_RECOVERY_YEAR1_MEAN : POST_BEAR_RECOVERY_YEAR2_MEAN;
      // Scale: 1-year bear gets ~70% of full boost; 3+ year bear gets 100%
      const scale = Math.min(1, 0.5 + 0.25 * lastBearDuration);
      recoveryBoost = baseMean * scale;
    }
    const assetReturns = generateCorrelatedReturns(rng, choleskyL, yearMeans, stdDevs, inBearRegime, regimeMask, recoveryBoost);

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

    // ── Income from jobs (per owner) ──
    // Each job is active when its owner's age falls within its own window.
    // A regular job ends at the owner's retirementAge (retiring at N means the
    // person is retired starting the year they turn N — no salary that year).
    // Explicit post-retirement gigs (startAge >= retirementAge) are honored.
    let primarySalary = 0;
    let spouseSalary = 0;
    const activeJobs: typeof s.jobs = [];
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
    const salary = primarySalary + spouseSalary;

    const ssClaiming = age >= s.socialSecurityClaimAge;
    // Benefit is entered in today's dollars; index from TODAY (not from claim age)
    // so purchasing power isn't silently eroded during the pre-claim years.
    let socialSecurity = ssClaiming
      ? s.socialSecurityBenefit * Math.pow(1 + s.socialSecurityCOLA, yearsFromNow)
      : 0;

    // ── Social Security earnings test (per person) ──
    // Before Full Retirement Age, SS benefits are reduced if earned income exceeds threshold
    const birthYear = new Date().getFullYear() - s.currentAge;
    const fraMonths = getFullRetirementAgeMonths(birthYear);
    const fraAge = Math.ceil(fraMonths / 12);
    let ssEarningsTestReduction = 0;
    if (socialSecurity > 0 && age < fraAge && primarySalary > 0) {
      // 2026 exempt amount (~$23,400, indexed) — $1 reduction per $2 earned above threshold
      const ssEarningsExempt = 23400 * Math.pow(1 + (s.taxBracketInflationRate ?? 0.02), yearsFromNow);
      const excessEarnings = Math.max(0, primarySalary - ssEarningsExempt);
      ssEarningsTestReduction = Math.min(socialSecurity, excessEarnings * 0.5);
      socialSecurity -= ssEarningsTestReduction;
    }

    // ── Pension ──
    let pension = 0;
    let pensionLumpSumTaxable = 0;
    if (s.pensionType === 'lumpSum') {
      // Lump sum: deposit into chosen account at pension start age
      if (age === s.pensionStartAge && s.pensionAmount > 0) {
        const acct = s.pensionLumpSumAccount ?? 'traditionalIRA';
        balances[acct] += s.pensionAmount;
        if (acct === 'taxable') {
          taxableCostBasis += s.pensionAmount;
          // Cash-out is taxed as ordinary income
          pensionLumpSumTaxable = s.pensionAmount;
        }
        // IRA rollover: no immediate tax event
      }
    } else {
      // Annuity: annual pension income
      const pensionActive = isRetired && age >= s.pensionStartAge && s.pensionAmount > 0;
      const pensionYears = pensionActive ? age - s.pensionStartAge : 0;
      pension = pensionActive
        ? s.pensionAmount * Math.pow(1 + s.pensionCOLA, pensionYears)
        : 0;
    }

    // ── Spouse Social Security ──
    let spouseSS = 0;
    if (sp?.enabled && spouseAge !== null) {
      const spouseSsClaiming = spouseAge >= sp.socialSecurityClaimAge;
      spouseSS = spouseSsClaiming
        ? sp.socialSecurityBenefit * Math.pow(1 + s.socialSecurityCOLA, yearsFromNow)
        : 0;

      // Spouse SS earnings test — reduced if spouse still working pre-FRA
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

    let otherIncome = 0;
    for (const src of s.otherIncomeSources) {
      if (age >= src.startAge && age <= src.endAge) {
        otherIncome += src.annualAmount * Math.pow(1 + src.inflationRate, yearsFromNow);
      }
    }

    const totalIncome = salary + socialSecurity + spouseSS + pension + otherIncome;

    // ── Contributions (per owner) ──
    // Each owner gets their own 401k/IRA/HSA limits applied independently;
    // each pays employer match only from their own jobs.
    const contributions = emptyBalances();
    let employeePreTax401k = 0; // for wage tax calculation
    let employeeHSA = 0;
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
            taxableCostBasis += result.contributions[acct];
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

    // ── Taxable-account investment income (dividends & interest) ──
    // The blended return already includes these; recharacterize the slice as
    // currently-taxed income: qualified dividends (LTCG rates) on the stock
    // portion, interest (ordinary) on bond/cash. Reinvested → adds to basis.
    let taxableDividends = 0;
    let taxableInterestIncome = 0;
    if (balances.taxable > 0) {
      const taxAlloc = getAllocation(scenario, 'taxable', isRetired);
      const stockPct = (taxAlloc[ASSET_CLASSES.indexOf('stocks')] ?? 0) / 100;
      const bondPct = (taxAlloc[ASSET_CLASSES.indexOf('bonds')] ?? 0) / 100;
      const cashPct = (taxAlloc[ASSET_CLASSES.indexOf('cash')] ?? 0) / 100;
      const bondMean = means[ASSET_CLASSES.indexOf('bonds')] ?? 0;
      const cashMean = means[ASSET_CLASSES.indexOf('cash')] ?? 0;
      taxableDividends = balances.taxable * stockPct * QUALIFIED_DIVIDEND_YIELD;
      taxableInterestIncome = balances.taxable * Math.max(0, bondPct * bondMean + cashPct * cashMean);
      taxableCostBasis += taxableDividends + taxableInterestIncome;
    }

    // ── Roth Conversion ──
    let rothConversionAmount = 0;
    if (s.rothConversion?.enabled && age >= s.rothConversion.startAge && age <= s.rothConversion.endAge) {
      const traditionalBalance = balances.traditional401k + balances.traditionalIRA;
      if (traditionalBalance > 0) {
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
          const ordinaryExSS = salary + pension + otherIncome + taxableInterestIncome;
          // Estimate SS taxable portion for bracket room calc
          // (SS thresholds are statutorily frozen — not indexed)
          const totalSS = socialSecurity + spouseSS;
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
            const estSpending = s.baseAnnualSpending * Math.pow(1 + s.spendingInflationRate, yearsFromNow);
            const estIncome = socialSecurity + spouseSS + pension + otherIncome;
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
        rothConversionAmount = Math.min(conversionTarget, traditionalBalance);

        if (rothConversionAmount > 0) {
          // Pull proportionally from traditional401k and traditionalIRA
          const pct401k = balances.traditional401k / traditionalBalance;
          const from401k = rothConversionAmount * pct401k;
          const fromIRA = rothConversionAmount - from401k;
          balances.traditional401k -= from401k;
          balances.traditionalIRA -= fromIRA;
          balances.rothIRA += rothConversionAmount;
          // Track for Roth 5-year rule
          rothConversionsByAge.set(age, (rothConversionsByAge.get(age) || 0) + rothConversionAmount);
        }
      }
    }

    // ── Spending (retirement) ──
    let spending = 0;
    const withdrawals = emptyBalances();
    let capitalGains = 0;
    let rmdAmount = 0;

    // ── Early withdrawal penalty helper ──
    // 10% penalty on Traditional 401k/IRA withdrawals before 59.5
    // Rule of 55: 401k penalty-free if separated from service at 55+
    // Roth IRA follows IRS ordering: contribution basis (penalty-free) →
    // conversions oldest-first (penalized only if < 5 years old) → earnings (penalized).
    // A conversion itself is never penalized — the full amount is converted.

    // Walk Roth IRA layers for a withdrawal; returns the penalizable portion.
    // consume=true permanently uses up basis/conversion layers (call once per year).
    const walkRothLayers = (amount: number, consume: boolean): number => {
      let remaining = amount;
      let penalized = 0;
      const fromBasis = Math.min(remaining, rothBasisRemaining);
      remaining -= fromBasis;
      if (consume) rothBasisRemaining -= fromBasis;
      const convAges = [...rothConversionsByAge.keys()].sort((a, b) => a - b);
      for (const convAge of convAges) {
        if (remaining <= 0) break;
        const layerAmt = rothConversionsByAge.get(convAge)!;
        const take = Math.min(remaining, layerAmt);
        if (age - convAge < 5) penalized += take;
        remaining -= take;
        if (consume) {
          if (take >= layerAmt) rothConversionsByAge.delete(convAge);
          else rothConversionsByAge.set(convAge, layerAmt - take);
        }
      }
      penalized += remaining; // beyond basis and all conversion layers = earnings
      return penalized;
    };

    const calcPenaltyAmount = (w: AccountBalances): number => {
      if (age >= 60) return 0; // 59.5 — using 60 as annual approximation
      let penalizable = 0;

      // Traditional 401k — penalty-free if Rule of 55 eligible and age >= 55
      const rule55 = s.ruleof55Eligible && age >= 55;
      if (w.traditional401k > 0 && !rule55) {
        penalizable += w.traditional401k;
      }
      // Traditional IRA — always subject to penalty before 59.5
      penalizable += w.traditionalIRA;

      // Roth IRA — layered ordering (basis → conversions → earnings)
      // Roth 401k basis/earnings split isn't tracked; treated as penalty-free.
      if (w.rothIRA > 0) {
        penalizable += walkRothLayers(w.rothIRA, false);
      }

      return penalizable;
    };

    if (isRetired) {
      let baseSpending = s.baseAnnualSpending * yearInflationFactor;

      // Housing: downsizing proceeds deposited at the chosen age
      if (s.housing?.enabled) {
        if (age === s.housing.downsizingAge && s.housing.downsizingProceeds > 0) {
          // Downsizing proceeds appreciate at inflation + 1% (historical real home appreciation)
          const homeAppreciation = s.spendingInflationRate + 0.01;
          const proceeds = s.housing.downsizingProceeds * Math.pow(1 + homeAppreciation, yearsFromNow);
          balances.taxable += proceeds;
          taxableCostBasis += proceeds;
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
        highWaterMark = Math.max(highWaterMark, currentTotal);
        const drawdownPct = highWaterMark > 0
          ? ((highWaterMark - currentTotal) / highWaterMark) * 100
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
        currentSpendingAdjustment = yearAdjustment;

        baseSpending *= currentSpendingAdjustment;
      }

      spending = baseSpending;

      // ── Mortgage P&I (non-discretionary) ──
      // Fixed-rate P&I is constant in nominal dollars — never inflated —
      // and contractual, so guardrail cuts don't apply.
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

        // Pay healthcare from HSA first (tax-free qualified medical use), then portfolio
        if (balances.hsa > 0 && annualHealthcare > 0) {
          const hsaUsed = Math.min(balances.hsa, annualHealthcare);
          balances.hsa -= hsaUsed;
          withdrawals.hsa += hsaUsed;
          annualHealthcare -= hsaUsed;
        }
        spending += annualHealthcare;
      }

      // ── Iterative tax-aware withdrawal loop ──
      // Withdraw enough to cover spending + taxes on those withdrawals.
      // Tax on traditional withdrawals creates additional cash need; iterate to converge.
      // Salary is counted net of the savings-rate portion, which has already been
      // diverted into contributions above and isn't available to fund spending.
      const netSalaryCash = salary > 0 ? salary * (1 - s.totalSavingsRate) : 0;
      const incomeFromSources = socialSecurity + spouseSS + pension + otherIncome + netSalaryCash;
      let totalCashNeed = Math.max(0, spending - incomeFromSources);

      // ── Bracket-fill limit for tax-efficient withdrawals ──
      // Compute the total traditional withdrawal that would keep ordinary income at
      // or below the top of the 12% bracket. Passed to executeWithdrawals so the
      // tax-efficient strategy can cap early traditional draws at the low bracket,
      // fall through to taxable, then accept higher brackets only if needed.
      // (Only computed for taxEfficient; other strategies ignore the value.)
      let traditionalBracketFillLimit: number | undefined;
      if (s.withdrawalStrategy === 'taxEfficient') {
        const idx = Math.pow(1 + (s.taxBracketInflationRate ?? 0), yearsFromNow);
        const brackets = getFederalBrackets(s.filingStatus ?? 'hoh');
        const stdDed = getStandardDeduction(s.filingStatus ?? 'hoh') * idx;
        const ssThresh = getSSThresholds(s.filingStatus ?? 'hoh');
        // Existing ordinary income excluding SS (wages, pension, other, Roth conv)
        const wagesTaxable = (activeJobs.length > 0 && salary > 0) ? salary - employeePreTax401k - employeeHSA : salary;
        const ordinaryExSS = wagesTaxable + pension + pensionLumpSumTaxable + otherIncome + rothConversionAmount + taxableInterestIncome;
        // Estimate SS taxable portion (mirrors Roth conversion logic;
        // SS thresholds are statutorily frozen — not indexed)
        const totalSS = socialSecurity + spouseSS;
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
        traditionalBracketFillLimit = Math.max(0, twelvePctCeiling + stdDed - existingOrdinary);
      }

      // RMDs must be taken even when income fully covers spending
      const rmdIsDue = age >= rmdStartAge && (priorYearEnd401k + priorYearEndIRA) > 0;

      if ((totalCashNeed > 0 || rothConversionAmount > 0 || rmdIsDue) && !depleted) {
        // Save balance snapshot for iteration
        const balanceSnapshot = cloneBalances(balances);
        const costBasisSnapshot = taxableCostBasis;

        // Iterate up to 5 times to converge on tax-aware withdrawal amount
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
            priorYearTraditionalBalance: priorYearEnd401k + priorYearEndIRA,
            priorYear401kBalance: priorYearEnd401k,
            priorYearIRABalance: priorYearEndIRA,
            taxableCostBasisPct: Math.min(1, Math.max(0, costBasisPct)),
            rmdStartAge,
            traditionalBracketFillLimit,
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
          const iterPenaltyAmount = calcPenaltyAmount(withdrawals);
          const iterTaxInput: TaxInput = {
            wages: (activeJobs.length > 0 && salary > 0) ? salary - employeePreTax401k - employeeHSA : salary,
            ficaWages: salary > 0 ? salary - employeeHSA : 0,
            traditionalWithdrawals: tradW + rothConversionAmount,
            socialSecurity: socialSecurity + spouseSS,
            pension: pension + pensionLumpSumTaxable,
            capitalGains: capitalGains + taxableDividends,
            taxableInterest: taxableInterestIncome,
            otherTaxableIncome: otherIncome,
            age,
            filingStatus: s.filingStatus,
            stateCode: s.stateCode,
            yearsFromNow,
            taxBracketInflationRate: s.taxBracketInflationRate ?? 0,
            earlyWithdrawalPenaltyAmount: iterPenaltyAmount,
          };
          const iterTax = calculateTaxes(iterTaxInput);

          const newCashNeed = Math.max(0, spending + iterTax.total - incomeFromSources);
          // If converged (within $100), break
          if (Math.abs(newCashNeed - totalCashNeed) < 100) {
            totalCashNeed = newCashNeed;
            break;
          }
          totalCashNeed = newCashNeed;
        }
      }
    }

    // ── Taxes ──
    const traditionalWithdrawals = withdrawals.traditional401k + withdrawals.traditionalIRA + rothConversionAmount;
    const penaltyAmount = isRetired ? calcPenaltyAmount(withdrawals) : 0;
    const taxInput: TaxInput = {
      // Income-tax wages: net of pre-tax 401k + HSA. FICA wages: gross minus HSA only
      // (401k deferrals remain FICA-taxable). Employer match affects neither.
      wages: (activeJobs.length > 0 && salary > 0) ? salary - employeePreTax401k - employeeHSA : salary,
      ficaWages: salary > 0 ? salary - employeeHSA : 0,
      traditionalWithdrawals,
      socialSecurity: socialSecurity + spouseSS,
      pension: pension + pensionLumpSumTaxable,
      capitalGains: capitalGains + taxableDividends,
      taxableInterest: taxableInterestIncome,
      otherTaxableIncome: otherIncome,
      age,
      filingStatus: s.filingStatus,
      stateCode: s.stateCode,
      yearsFromNow,
      taxBracketInflationRate: s.taxBracketInflationRate ?? 0,
      earlyWithdrawalPenaltyAmount: penaltyAmount,
    };

    const taxResult = calculateTaxes(taxInput);

    // Consume Roth IRA basis/conversion layers actually withdrawn this year
    if (withdrawals.rothIRA > 0) {
      walkRothLayers(withdrawals.rothIRA, true);
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
    if (!isRetired) highWaterMark = totalBal;

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

  // Median path (smoothed: average of paths between p45 and p55)
  const sortedByEnding = [...paths].sort((a, b) => a.endingBalance - b.endingBalance);
  const p45Idx = Math.floor(n * 0.45);
  const p55Idx = Math.floor(n * 0.55);
  const medianBandPaths = sortedByEnding.slice(p45Idx, p55Idx + 1);
  const medianBandCount = medianBandPaths.length;
  const medianPath: YearResult[] = [];
  for (let yi = 0; yi < numYears; yi++) {
    const base = medianBandPaths[0].years[yi];
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
    for (const p of medianBandPaths) {
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
    avg.totalBalance /= medianBandCount;
    avg.spending /= medianBandCount;
    avg.investmentReturn /= medianBandCount;
    avg.rmdAmount /= medianBandCount;
    avg.rothConversionAmount /= medianBandCount;
    avg.income.salary /= medianBandCount;
    avg.income.socialSecurity /= medianBandCount;
    avg.income.pension /= medianBandCount;
    avg.income.other /= medianBandCount;
    avg.income.total /= medianBandCount;
    avg.taxes.federal /= medianBandCount;
    avg.taxes.state /= medianBandCount;
    avg.taxes.capitalGains /= medianBandCount;
    avg.taxes.fica /= medianBandCount;
    avg.taxes.total /= medianBandCount;
    for (const acct of ACCOUNT_TYPES) {
      avg.balances[acct] /= medianBandCount;
      avg.contributions[acct] /= medianBandCount;
      avg.withdrawals[acct] /= medianBandCount;
    }
    avg.depleted = avg.totalBalance <= 0;
    medianPath.push(avg);
  }

  // Worst decile path (average of bottom 10%)
  const worstCount = Math.max(1, Math.floor(n * 0.10));
  const worstPaths = sortedByEnding.slice(0, worstCount);
  const worstDecilePath: YearResult[] = [];
  for (let yi = 0; yi < numYears; yi++) {
    const base = worstPaths[0].years[yi];
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
    for (const p of worstPaths) {
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
    const wc = worstPaths.length;
    avg.totalBalance /= wc;
    avg.spending /= wc;
    avg.investmentReturn /= wc;
    avg.rmdAmount /= wc;
    avg.rothConversionAmount /= wc;
    avg.income.salary /= wc;
    avg.income.socialSecurity /= wc;
    avg.income.pension /= wc;
    avg.income.other /= wc;
    avg.income.total /= wc;
    avg.taxes.federal /= wc;
    avg.taxes.state /= wc;
    avg.taxes.capitalGains /= wc;
    avg.taxes.fica /= wc;
    avg.taxes.total /= wc;
    for (const acct of ACCOUNT_TYPES) {
      avg.balances[acct] /= wc;
      avg.contributions[acct] /= wc;
      avg.withdrawals[acct] /= wc;
    }
    avg.depleted = avg.totalBalance <= 0;
    worstDecilePath.push(avg);
  }

  // Average path (mean across ALL simulations, including per-account balances)
  const averagePath: YearResult[] = [];
  for (let yi = 0; yi < numYears; yi++) {
    const base = paths[0].years[yi];
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
    for (const p of paths) {
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
    avg.totalBalance /= n;
    avg.spending /= n;
    avg.investmentReturn /= n;
    avg.rmdAmount /= n;
    avg.rothConversionAmount /= n;
    avg.income.salary /= n;
    avg.income.socialSecurity /= n;
    avg.income.pension /= n;
    avg.income.other /= n;
    avg.income.total /= n;
    avg.taxes.federal /= n;
    avg.taxes.state /= n;
    avg.taxes.capitalGains /= n;
    avg.taxes.fica /= n;
    avg.taxes.total /= n;
    for (const acct of ACCOUNT_TYPES) {
      avg.balances[acct] /= n;
      avg.contributions[acct] /= n;
      avg.withdrawals[acct] /= n;
    }
    avg.depleted = avg.totalBalance <= 0;
    averagePath.push(avg);
  }

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
      baseAnnualSpending: monthlySpending, // stored as monthly, toAnnualScenario multiplies by 12
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
  let high = scenario.baseAnnualSpending * 5; // 5x current spending as upper bound
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
