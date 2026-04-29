import type {
  ScenarioInput, SimulationPath, YearResult,
  AccountBalances, AccountType, AssetClass,
  SimulationResult, PercentileBand, SimulationParams,
} from '../types';
import { ASSET_CLASSES, ACCOUNT_TYPES } from '../types';
import { PRNG, cholesky, generateCorrelatedReturns, blendedReturn } from './math';
import { DEFAULT_CORRELATION_MATRIX, DEFAULT_ASSET_RETURNS } from '../constants/asset-classes';
import { allocateContributions } from './contributions';
import { executeWithdrawals } from './withdrawals';
import { estimateSSBenefit, getFullRetirementAgeMonths } from '../utils/social-security';
import { calculateTaxes, type TaxInput } from './tax';
import { getFederalBrackets, getStandardDeduction, getSSThresholds } from '../constants/tax';
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

  // Use highest-paying job for SS estimation
  const highestSalary = (s.jobs ?? []).length > 0
    ? Math.max(...(s.jobs ?? []).map(j => j.monthlyPay))
    : 0;
  const ssBenefit = estimateSSBenefit(highestSalary, s.socialSecurityClaimAge, s.currentAge);

  return {
    ...s,
    socialSecurityBenefit: ssBenefit,
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
    pensionAmount: resolved.pensionAmount * 12,
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
function runSinglePath(scenario: ScenarioInput, rng: PRNG, choleskyL: number[][]): SimulationPath {
  const s = toAnnualScenario(scenario);
  const years: YearResult[] = [];
  const balances = cloneBalances(s.balances);
  let taxableCostBasis = balances.taxable * s.taxableCostBasisPct;

  const means = ASSET_CLASSES.map(ac => (s.investments.assetClassReturns[ac] ?? DEFAULT_ASSET_RETURNS[ac]).mean);
  const stdDevs = ASSET_CLASSES.map(ac => (s.investments.assetClassReturns[ac] ?? DEFAULT_ASSET_RETURNS[ac]).stdDev);
  const df = s.investments.fatTailDf;

  // Stocks & crypto get Student-t fat tails; bonds & cash stay Gaussian
  const fatTailMask = ASSET_CLASSES.map(ac => ac === 'stocks' || ac === 'crypto');

  let depleted = false;
  let depletionAge: number | null = null;
  let highWaterMark = sumBalances(balances);
  let currentSpendingAdjustment = 1.0; // for guardrails

  // Roth 5-year rule: track conversion amounts by year (age)
  // Converted amounts can't be withdrawn penalty-free until 5 years later
  const rothConversionsByAge: Map<number, number> = new Map();

  // Track prior-year-end traditional balances for RMD (IRS uses Dec 31 balance of prior year)
  let priorYearEnd401k = balances.traditional401k;
  let priorYearEndIRA = balances.traditionalIRA;

  // Cumulative inflation factor — compounds year over year with random variation
  let cumulativeInflationFactor = 1.0;

  for (let age = s.currentAge; age <= s.endAge; age++) {
    const isRetired = age >= s.retirementAge;
    const yearsFromNow = age - s.currentAge;

    // ── Generate returns for this year ──
    const assetReturns = generateCorrelatedReturns(rng, choleskyL, means, stdDevs, df, fatTailMask);

    // Compute portfolio-weighted return signal for cash buffer decisions
    let portfolioReturnSignal = 0;
    if (isRetired && s.cashBuffer?.enabled) {
      let totalWeight = 0;
      for (const acct of ACCOUNT_TYPES) {
        if (acct === 'cashAccount') continue; // exclude the buffer itself
        if (balances[acct] <= 0) continue;
        const allocPcts = getAllocation(scenario, acct, isRetired);
        const ret = blendedReturn(assetReturns, allocPcts);
        portfolioReturnSignal += ret * balances[acct];
        totalWeight += balances[acct];
      }
      portfolioReturnSignal = totalWeight > 0 ? portfolioReturnSignal / totalWeight : 0;
    }

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

    // ── Income from jobs ──
    // Sum salary from all active jobs at this age
    let totalJobSalary = 0;
    const activeJobs: typeof s.jobs = [];
    for (const job of (s.jobs ?? [])) {
      if (age >= job.startAge && age < job.endAge) {
        const jobSalary = job.monthlyPay * Math.pow(1 + s.salaryGrowthRate, yearsFromNow);
        totalJobSalary += jobSalary;
        activeJobs.push(job);
      }
    }
    const salary = totalJobSalary;

    const ssClaiming = age >= s.socialSecurityClaimAge;
    const ssYears = ssClaiming ? age - s.socialSecurityClaimAge : 0;
    let socialSecurity = ssClaiming
      ? s.socialSecurityBenefit * Math.pow(1 + s.socialSecurityCOLA, ssYears)
      : 0;

    // ── Social Security earnings test ──
    // Before Full Retirement Age, SS benefits are reduced if earned income exceeds threshold
    const birthYear = new Date().getFullYear() - s.currentAge;
    const fraMonths = getFullRetirementAgeMonths(birthYear);
    const fraAge = Math.ceil(fraMonths / 12);
    const earnedIncome = salary;
    let ssEarningsTestReduction = 0;
    if (socialSecurity > 0 && age < fraAge && earnedIncome > 0) {
      // 2026 exempt amount (~$23,400, indexed) — $1 reduction per $2 earned above threshold
      const ssEarningsExempt = 23400 * Math.pow(1 + (s.taxBracketInflationRate ?? 0.02), yearsFromNow);
      const excessEarnings = Math.max(0, earnedIncome - ssEarningsExempt);
      ssEarningsTestReduction = Math.min(socialSecurity, excessEarnings * 0.5);
      socialSecurity -= ssEarningsTestReduction;
    }

    const pensionActive = isRetired && age >= s.pensionStartAge && s.pensionAmount > 0;
    const pensionYears = pensionActive ? age - s.pensionStartAge : 0;
    const pension = pensionActive
      ? s.pensionAmount * Math.pow(1 + s.pensionCOLA, pensionYears)
      : 0;

    let otherIncome = 0;
    for (const src of s.otherIncomeSources) {
      if (age >= src.startAge && age <= src.endAge) {
        otherIncome += src.annualAmount * Math.pow(1 + src.inflationRate, yearsFromNow);
      }
    }

    const totalIncome = salary + socialSecurity + pension + otherIncome;

    // ── Contributions (from jobs before retirement age) ──
    const contributions = emptyBalances();
    let employeePreTax401k = 0; // for wage tax calculation
    let employeeHSA = 0;
    if (!isRetired && salary > 0) {
      const totalSavings = salary * s.totalSavingsRate;

      // Compute employer match from all jobs that have 401k
      let totalEmployerMatch = 0;
      for (const job of activeJobs) {
        if (job.has401k && job.employerMatchRate > 0 && job.employerMatchCapPct > 0) {
          const jobSalary = job.monthlyPay * Math.pow(1 + s.salaryGrowthRate, yearsFromNow);
          const desired401k = totalSavings *
            ((s.contributionAllocation.traditional401k + s.contributionAllocation.roth401k) / 100);
          const matchableAmount = Math.min(desired401k, jobSalary * job.employerMatchCapPct);
          totalEmployerMatch += matchableAmount * job.employerMatchRate;
        }
      }

      // Inflate contribution limits by the same rate as tax brackets (IRS CPI indexing)
      const limIdx = Math.pow(1 + (s.taxBracketInflationRate ?? 0), yearsFromNow);

      // Only allow 401k contributions if at least one active job has 401k
      const has401k = activeJobs.some(j => j.has401k);
      const effectiveAllocation = { ...s.contributionAllocation };
      if (!has401k) {
        // Redirect 401k allocation to taxable
        effectiveAllocation.taxable += effectiveAllocation.traditional401k + effectiveAllocation.roth401k;
        effectiveAllocation.traditional401k = 0;
        effectiveAllocation.roth401k = 0;
      }

      const result = allocateContributions({
        totalSavings,
        allocation: effectiveAllocation,
        age,
        limit401k: s.limit401k * limIdx,
        limitIRA: s.limitIRA * limIdx,
        enable401kCatchUp: s.enable401kCatchUp,
        enableIRACatchUp: s.enableIRACatchUp,
        employerMatch: totalEmployerMatch,
        employerRothPct: s.employerRothPct,
        catchUp401k: DEFAULT_401K_CATCHUP * limIdx,
        superCatchUp401k: DEFAULT_401K_SUPER_CATCHUP * limIdx,
        catchUpIRA: DEFAULT_IRA_CATCHUP * limIdx,
        hsaLimit: DEFAULT_HSA_SELF_ONLY * limIdx,
      });

      // Track employee-only pre-tax amounts for wage calculation
      employeePreTax401k = result.contributions.traditional401k;
      employeeHSA = result.contributions.hsa;

      // Add employee contributions
      for (const acct of ACCOUNT_TYPES) {
        contributions[acct] = result.contributions[acct];
        balances[acct] += result.contributions[acct];
        if (acct === 'taxable') {
          taxableCostBasis += result.contributions[acct];
        }
      }

      // Add employer match contributions (separate from employee)
      for (const acct of ACCOUNT_TYPES) {
        if (result.employerContributions[acct] > 0) {
          contributions[acct] += result.employerContributions[acct];
          balances[acct] += result.employerContributions[acct];
        }
      }
    }

    // Post-retirement job income: savings go to taxable account
    if (isRetired && salary > 0) {
      const postRetSavings = salary * s.totalSavingsRate;
      contributions.taxable += postRetSavings;
      balances.taxable += postRetSavings;
      taxableCostBasis += postRetSavings;
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
          const ordinaryExSS = salary + pension + otherIncome;
          // Estimate SS taxable portion for bracket room calc
          const provisionalIncome = ordinaryExSS + socialSecurity * 0.5;
          let estSSTaxable = 0;
          if (socialSecurity > 0 && provisionalIncome > ssThresh.low * idx) {
            estSSTaxable = Math.min(0.85 * socialSecurity,
              provisionalIncome > ssThresh.high * idx
                ? 0.5 * (ssThresh.high * idx - ssThresh.low * idx) + 0.85 * (provisionalIncome - ssThresh.high * idx)
                : 0.5 * (provisionalIncome - ssThresh.low * idx));
            estSSTaxable = Math.max(0, Math.min(estSSTaxable, 0.85 * socialSecurity));
          }
          const existingOrdinary = ordinaryExSS + estSSTaxable;

          // Estimate traditional withdrawal for spending so the conversion doesn't
          // consume bracket room that spending withdrawals will also need.
          let estTradWithdrawal = 0;
          if (isRetired) {
            const estSpending = s.baseAnnualSpending * Math.pow(1 + s.spendingInflationRate, yearsFromNow);
            const estIncome = socialSecurity + pension + otherIncome;
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
    // Roth IRA: contribution basis is always penalty-free
    // Roth 5-year rule: converted amounts subject to penalty if < 5 years
    const calcPenaltyAmount = (w: AccountBalances, conversionAmt: number): number => {
      if (age >= 60) return 0; // 59.5 — using 60 as annual approximation
      let penalizable = 0;

      // Traditional 401k — penalty-free if Rule of 55 eligible and age >= 55
      if (w.traditional401k > 0 && !(s.ruleof55Eligible && age >= 55)) {
        penalizable += w.traditional401k;
      }
      // Traditional IRA — always subject to penalty before 59.5
      penalizable += w.traditionalIRA;

      // Roth IRA withdrawals: contributions are penalty-free, earnings are penalized
      if (w.rothIRA > 0) {
        const rothBasis = Math.max(0, s.rothContributionBasis);
        // Penalty only on amount exceeding contribution basis
        penalizable += Math.max(0, w.rothIRA - rothBasis);
      }

      // Roth 5-year rule: conversions done within last 5 years are penalized on withdrawal
      let unconvertedPenalty = 0;
      for (const [convAge, convAmt] of rothConversionsByAge) {
        if (age - convAge < 5 && age < 60) {
          unconvertedPenalty += convAmt;
        }
      }
      // The conversion penalty applies to Roth withdrawals from converted amounts
      penalizable += Math.min(unconvertedPenalty, w.roth401k + w.rothIRA);

      // Roth conversion this year is also subject to penalty if early
      if (conversionAmt > 0) {
        penalizable += conversionAmt;
      }

      return penalizable;
    };

    if (isRetired) {
      let baseSpending = s.baseAnnualSpending * yearInflationFactor;

      // Housing: subtract mortgage payment if paid off, add downsizing proceeds
      if (s.housing?.enabled) {
        if (age < s.housing.payoffAge) {
          baseSpending += s.housing.mortgagePayment * yearInflationFactor;
        }
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
        spending += annualHealthcare;
      }

      // ── Iterative tax-aware withdrawal loop ──
      // Withdraw enough to cover spending + taxes on those withdrawals.
      // Tax on traditional withdrawals creates additional cash need; iterate to converge.
      const incomeFromSources = socialSecurity + pension + otherIncome + salary;
      let totalCashNeed = Math.max(0, spending - incomeFromSources);

      if ((totalCashNeed > 0 || rothConversionAmount > 0) && !depleted) {
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
          const iterPenaltyAmount = calcPenaltyAmount(withdrawals, rothConversionAmount);
          const iterTaxInput: TaxInput = {
            wages: isRetired ? salary * (1 - s.totalSavingsRate) : 0,
            traditionalWithdrawals: tradW + rothConversionAmount,
            socialSecurity,
            pension,
            capitalGains,
            taxableInterest: 0,
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
    const penaltyAmount = isRetired ? calcPenaltyAmount(withdrawals, rothConversionAmount) : 0;
    const taxInput: TaxInput = {
      wages: isRetired ? salary * (1 - s.totalSavingsRate) : salary * (1 - s.totalSavingsRate),
      traditionalWithdrawals,
      socialSecurity,
      pension,
      capitalGains,
      taxableInterest: 0, // simplified
      otherTaxableIncome: otherIncome,
      age,
      filingStatus: s.filingStatus,
      stateCode: s.stateCode,
      yearsFromNow,
      taxBracketInflationRate: s.taxBracketInflationRate ?? 0,
      earlyWithdrawalPenaltyAmount: penaltyAmount,
    };

    // Adjust wages for pre-tax employee contributions (traditional 401k + HSA reduce taxable wages)
    // Employer match does NOT reduce taxable wages
    if (!isRetired && salary > 0) {
      taxInput.wages = salary - employeePreTax401k - employeeHSA;
    }

    const taxResult = calculateTaxes(taxInput);

    // ── Surplus income reinvestment ──
    // When retirement income exceeds spending + taxes, reinvest surplus into taxable
    if (isRetired) {
      const retirementIncome = socialSecurity + pension + otherIncome + salary;
      const surplus = retirementIncome - spending - taxResult.total;
      if (surplus > 0) {
        balances.taxable += surplus;
        taxableCostBasis += surplus;
      }
    }

    // ── Apply returns ──
    let totalReturn = 0;
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

    // ── Cash buffer refill in up markets ──
    if (isRetired && s.cashBuffer?.enabled && s.cashBuffer.refillInUpMarkets && portfolioReturnSignal >= 0) {
      const targetBuffer = s.cashBuffer.yearsOfExpenses * spending;
      const deficit = targetBuffer - balances.cashAccount;
      if (deficit > 0) {
        const refillOrder: AccountType[] = ['taxable', 'otherAssets', 'traditional401k', 'traditionalIRA', 'roth401k', 'rothIRA'];
        let remaining = deficit;
        for (const acct of refillOrder) {
          if (remaining <= 0) break;
          const transfer = Math.min(remaining, balances[acct]);
          if (transfer > 0) {
            balances[acct] -= transfer;
            balances.cashAccount += transfer;
            remaining -= transfer;
            if (acct === 'taxable') {
              const prevBal = balances[acct] + transfer;
              if (prevBal > 0) {
                taxableCostBasis *= (1 - transfer / prevBal);
              }
            }
          }
        }
      }
    }

    // Update high water mark
    const totalBal = sumBalances(balances);
    if (!isRetired) highWaterMark = totalBal;

    // Check depletion
    if (isRetired && totalBal <= 0 && !depleted) {
      depleted = true;
      depletionAge = age;
    }

    years.push({
      age,
      totalBalance: totalBal,
      balances: cloneBalances(balances),
      income: {
        salary,
        socialSecurity,
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
function aggregateResults(paths: SimulationPath[], scenario: ScenarioInput): SimulationResult {
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

  // Median path
  const medianIdx = Math.floor(n / 2);
  const sortedByEnding = [...paths].sort((a, b) => a.endingBalance - b.endingBalance);
  const medianPath = sortedByEnding[medianIdx].years;

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
  const choleskyL = cholesky(DEFAULT_CORRELATION_MATRIX);

  const paths: SimulationPath[] = [];
  for (let i = 0; i < params.numSimulations; i++) {
    paths.push(runSinglePath(scenario, rng, choleskyL));
    if (onProgress && (i % 50 === 0 || i === params.numSimulations - 1)) {
      onProgress(i + 1, params.numSimulations);
    }
  }

  return aggregateResults(paths, scenario);
}
