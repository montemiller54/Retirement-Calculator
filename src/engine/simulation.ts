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
import { estimateSSBenefit } from '../utils/social-security';
import { calculateTaxes, type TaxInput } from './tax';
import { getFederalBrackets, getStandardDeduction, getSSThresholds } from '../constants/tax';
import { DEFAULT_401K_CATCHUP, DEFAULT_IRA_CATCHUP, DEFAULT_HSA_SELF_ONLY } from '../constants/contribution-limits';

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

  const ssBenefit = estimateSSBenefit(s.currentSalary, s.socialSecurityClaimAge, s.currentAge);
  const spouseBenefit = s.spouse?.enabled
    ? s.spouse.currentSalary > 0
      ? estimateSSBenefit(s.spouse.currentSalary, s.spouse.socialSecurityClaimAge, s.spouse.currentAge)
      : Math.round(ssBenefit * 0.5)  // Spousal benefit: 50% of primary PIA
    : s.spouse?.socialSecurityBenefit ?? 0;

  return {
    ...s,
    socialSecurityBenefit: ssBenefit,
    spouse: s.spouse ? { ...s.spouse, socialSecurityBenefit: spouseBenefit } : s.spouse,
  };
}

// ── Convert monthly inputs to annual for the simulation loop ──
function toAnnualScenario(s: ScenarioInput): ScenarioInput {
  const resolved = resolveSSBenefits(s);
  return {
    ...resolved,
    currentSalary: resolved.currentSalary * 12,
    baseAnnualSpending: resolved.baseAnnualSpending * 12,
    socialSecurityBenefit: resolved.socialSecurityBenefit * 12,
    pensionAmount: resolved.pensionAmount * 12,
    otherIncomeSources: resolved.otherIncomeSources.map(src => ({
      ...src,
      annualAmount: src.annualAmount * 12,
    })),
    guardrails: {
      ...resolved.guardrails,
      minimumSpendingFloor: resolved.guardrails.minimumSpendingFloor * 12,
    },
    healthcare: {
      ...resolved.healthcare,
      preMedicareMonthly: resolved.healthcare.preMedicareMonthly * 12,
      medicareMonthly: resolved.healthcare.medicareMonthly * 12,
      lateLifeMonthly: resolved.healthcare.lateLifeMonthly * 12,
    },
    spouse: resolved.spouse ? {
      ...resolved.spouse,
      currentSalary: resolved.spouse.currentSalary * 12,
      socialSecurityBenefit: resolved.spouse.socialSecurityBenefit * 12,
      pensionAmount: resolved.spouse.pensionAmount * 12,
    } : resolved.spouse,
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

  // Track prior-year-end traditional balances for RMD (IRS uses Dec 31 balance of prior year)
  let priorYearEnd401k = balances.traditional401k;
  let priorYearEndIRA = balances.traditionalIRA;

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

    // ── Income ──
    const salary = isRetired ? 0 : s.currentSalary * Math.pow(1 + s.salaryGrowthRate, yearsFromNow);

    const ssClaiming = age >= s.socialSecurityClaimAge;
    const ssYears = ssClaiming ? age - s.socialSecurityClaimAge : 0;
    const socialSecurity = ssClaiming
      ? s.socialSecurityBenefit * Math.pow(1 + s.socialSecurityCOLA, ssYears)
      : 0;

    const pensionActive = isRetired && age >= s.pensionStartAge && s.pensionAmount > 0;
    const pensionYears = pensionActive ? age - s.pensionStartAge : 0;
    const pension = pensionActive
      ? s.pensionAmount * Math.pow(1 + s.pensionCOLA, pensionYears)
      : 0;

    // ── Spouse income ──
    let spouseSalary = 0;
    let spouseSS = 0;
    let spousePension = 0;
    const sp = s.spouse;
    if (sp?.enabled) {
      const spouseAge = sp.currentAge + yearsFromNow;
      const spouseRetired = spouseAge >= sp.retirementAge;

      spouseSalary = spouseRetired ? 0 : sp.currentSalary * Math.pow(1 + sp.salaryGrowthRate, yearsFromNow);

      const spouseSsClaiming = spouseAge >= sp.socialSecurityClaimAge;
      const spouseSsYears = spouseSsClaiming ? spouseAge - sp.socialSecurityClaimAge : 0;
      spouseSS = spouseSsClaiming
        ? sp.socialSecurityBenefit * Math.pow(1 + s.socialSecurityCOLA, spouseSsYears)
        : 0;

      const spousePensionActive = spouseRetired && spouseAge >= sp.pensionStartAge && sp.pensionAmount > 0;
      const spousePensionYears = spousePensionActive ? spouseAge - sp.pensionStartAge : 0;
      spousePension = spousePensionActive
        ? sp.pensionAmount * Math.pow(1 + sp.pensionCOLA, spousePensionYears)
        : 0;
    }

    let otherIncome = 0;
    for (const src of s.otherIncomeSources) {
      if (age >= src.startAge && age <= src.endAge) {
        const srcYears = age - src.startAge;
        otherIncome += src.annualAmount * Math.pow(1 + src.inflationRate, srcYears);
      }
    }

    const totalIncome = salary + socialSecurity + pension + otherIncome
      + spouseSalary + spouseSS + spousePension;

    // ── Contributions (accumulation) ──
    const contributions = emptyBalances();
    let employeePreTax401k = 0; // for wage tax calculation
    let employeeHSA = 0;
    if (!isRetired && salary > 0) {
      const totalSavings = salary * s.totalSavingsRate;

      // Compute employer match: matchRate × min(employee 401k deferrals, salary × matchCapPct)
      const desired401k = totalSavings *
        ((s.contributionAllocation.traditional401k + s.contributionAllocation.roth401k) / 100);
      const matchableAmount = Math.min(desired401k, salary * s.employerMatchCapPct);
      const employerMatchAmount = matchableAmount * s.employerMatchRate;

      // Inflate contribution limits by the same rate as tax brackets (IRS CPI indexing)
      const limIdx = Math.pow(1 + (s.taxBracketInflationRate ?? 0), yearsFromNow);

      const result = allocateContributions({
        totalSavings,
        allocation: s.contributionAllocation,
        age,
        limit401k: s.limit401k * limIdx,
        limitIRA: s.limitIRA * limIdx,
        enable401kCatchUp: s.enable401kCatchUp,
        enableIRACatchUp: s.enableIRACatchUp,
        employerMatch: employerMatchAmount,
        employerRothPct: s.employerRothPct,
        catchUp401k: DEFAULT_401K_CATCHUP * limIdx,
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

    // Spouse salary savings → taxable account (shared portfolio, simplified)
    if (spouseSalary > 0) {
      const spouseSavings = spouseSalary * s.totalSavingsRate;
      contributions.taxable += spouseSavings;
      balances.taxable += spouseSavings;
      taxableCostBasis += spouseSavings;
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
          const ordinaryExSS = (isRetired ? 0 : salary) + pension + otherIncome;
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
            const retYears = age - s.retirementAge;
            const estSpending = s.baseAnnualSpending * Math.pow(1 + s.spendingInflationRate, retYears);
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
        }
      }
    }

    // ── Spending (retirement) ──
    let spending = 0;
    const withdrawals = emptyBalances();
    let capitalGains = 0;
    let rmdAmount = 0;

    if (isRetired) {
      const retYears = age - s.retirementAge;
      let baseSpending = s.baseAnnualSpending * Math.pow(1 + s.spendingInflationRate, retYears);

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
      if (s.guardrails.enabled) {
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

        // Floor
        if (s.guardrails.minimumSpendingFloor > 0) {
          const inflatedFloor = s.guardrails.minimumSpendingFloor *
            Math.pow(1 + s.spendingInflationRate, retYears);
          baseSpending = Math.max(baseSpending, inflatedFloor);
        }
      }

      spending = baseSpending;

      // ── Healthcare costs (non-discretionary, not subject to guardrails) ──
      if (s.healthcare.enabled) {
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
      const incomeFromSources = socialSecurity + pension + otherIncome
        + spouseSS + spousePension + spouseSalary;
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
          const iterTaxInput: TaxInput = {
            wages: spouseSalary > 0 ? spouseSalary * (1 - s.totalSavingsRate) : 0,
            traditionalWithdrawals: tradW + rothConversionAmount,
            socialSecurity: socialSecurity + spouseSS,
            pension: pension + spousePension,
            capitalGains,
            taxableInterest: 0,
            otherTaxableIncome: otherIncome,
            age,
            filingStatus: s.filingStatus,
            stateCode: s.stateCode,
            yearsFromNow,
            taxBracketInflationRate: s.taxBracketInflationRate ?? 0,
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
    const combinedSS = socialSecurity + spouseSS;
    const combinedPension = pension + spousePension;
    const taxInput: TaxInput = {
      wages: isRetired ? 0 : salary * (1 - s.totalSavingsRate), // taxable wages after pre-tax contributions
      traditionalWithdrawals,
      socialSecurity: combinedSS,
      pension: combinedPension,
      capitalGains,
      taxableInterest: 0, // simplified
      otherTaxableIncome: otherIncome,
      age,
      filingStatus: s.filingStatus,
      stateCode: s.stateCode,
      yearsFromNow,
      taxBracketInflationRate: s.taxBracketInflationRate ?? 0,
    };

    // Adjust wages for pre-tax employee contributions (traditional 401k + HSA reduce taxable wages)
    // Employer match does NOT reduce taxable wages
    if (!isRetired) {
      taxInput.wages = salary - employeePreTax401k - employeeHSA;
    }
    // Add spouse wages (spouse savings go to taxable, not pre-tax accounts)
    if (spouseSalary > 0) {
      taxInput.wages += spouseSalary * (1 - s.totalSavingsRate);
    }

    const taxResult = calculateTaxes(taxInput);

    // ── Surplus income reinvestment ──
    // When retirement income exceeds spending + taxes, reinvest surplus into taxable
    if (isRetired) {
      const retirementIncome = socialSecurity + pension + otherIncome
        + spouseSS + spousePension + spouseSalary;
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
        salary: (isRetired ? 0 : salary) + spouseSalary,
        socialSecurity: socialSecurity + spouseSS,
        pension: pension + spousePension,
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
