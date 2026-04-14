import type { ScenarioInput } from '../types';
import { ACCOUNT_TYPES, ASSET_CLASSES, ACCOUNT_LABELS } from '../types';

export interface ValidationError {
  card: string;   // card id: 'profile' | 'earnings' | 'portfolio' | 'spending' | 'income' | 'withdrawal'
  field: string;  // dot-path matching setField keys, or descriptive key
  message: string;
}

export function validateScenario(s: ScenarioInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Profile ──
  if (!s.currentAge || s.currentAge < 18 || s.currentAge > 99) {
    errors.push({ card: 'profile', field: 'currentAge', message: 'Current age must be between 18 and 99.' });
  }
  if (!s.retirementAge || s.retirementAge <= s.currentAge) {
    errors.push({ card: 'profile', field: 'retirementAge', message: 'Retirement age must be greater than current age.' });
  }
  if (!s.endAge || s.endAge <= s.retirementAge) {
    errors.push({ card: 'profile', field: 'endAge', message: 'Plan-through age must be greater than retirement age.' });
  }
  if (s.endAge > 120) {
    errors.push({ card: 'profile', field: 'endAge', message: 'Plan-through age cannot exceed 120.' });
  }

  // Spouse
  if (s.spouse?.enabled) {
    if (!s.spouse.currentAge || s.spouse.currentAge < 18 || s.spouse.currentAge > 99) {
      errors.push({ card: 'profile', field: 'spouse.currentAge', message: "Spouse's current age must be between 18 and 99." });
    }
    if (!s.spouse.retirementAge || s.spouse.retirementAge <= s.spouse.currentAge) {
      errors.push({ card: 'profile', field: 'spouse.retirementAge', message: "Spouse's retirement age must be greater than their current age." });
    }
  }

  // ── Earnings ──
  const allocSum = ACCOUNT_TYPES.reduce((sum, a) => sum + (s.contributionAllocation[a] || 0), 0);
  if (Math.abs(allocSum - 100) > 0.01) {
    errors.push({ card: 'earnings', field: 'contributionAllocation', message: `Savings allocation adds up to ${Math.round(allocSum)}% — it must total exactly 100%.` });
  }

  // ── Portfolio ──
  if (s.investments.mode === 'advanced') {
    for (const phase of ['preRetirement', 'postRetirement'] as const) {
      const phaseLabel = phase === 'preRetirement' ? 'Pre-retirement' : 'Post-retirement';
      const allocations = s.investments[phase];
      for (const acct of ACCOUNT_TYPES) {
        if (s.balances[acct] <= 0 && allocSum > 0) continue; // skip unused accounts
        const alloc = allocations[acct];
        const rowSum = ASSET_CLASSES.reduce((sum, ac) => sum + (alloc[ac] || 0), 0);
        if (Math.abs(rowSum - 100) > 0.01 && rowSum > 0) {
          errors.push({
            card: 'portfolio',
            field: `investments.${phase}.${acct}`,
            message: `${phaseLabel} ${ACCOUNT_LABELS[acct]} allocation adds up to ${Math.round(rowSum)}% — it must total exactly 100%.`,
          });
        }
      }
    }
  }

  // Return assumptions
  for (const ac of ASSET_CLASSES) {
    const ret = s.investments.assetClassReturns[ac];
    if (ret && ret.stdDev < 0) {
      errors.push({ card: 'portfolio', field: `investments.assetClassReturns.${ac}.stdDev`, message: `${ac} volatility cannot be negative.` });
    }
  }

  if (s.investments.fatTailDf != null && (s.investments.fatTailDf < 3 || s.investments.fatTailDf > 30)) {
    errors.push({ card: 'portfolio', field: 'investments.fatTailDf', message: 'Tail Risk must be between 3 (extreme) and 30 (low).' });
  }

  // ── Spending & Healthcare ──
  if (s.healthcare?.enabled) {
    if (s.healthcare.medicareStartAge >= s.healthcare.lateLifeStartAge) {
      errors.push({ card: 'spending', field: 'healthcare.medicareStartAge', message: 'Medicare start age must be before late-life care start age.' });
    }
  }

  for (const exp of s.oneTimeExpenses) {
    if (exp.age < s.currentAge || exp.age > s.endAge) {
      errors.push({ card: 'spending', field: `oneTimeExpense.${exp.id}`, message: `One-time expense "${exp.name || 'Unnamed'}" is scheduled for age ${exp.age}, which is outside your planning window (${s.currentAge}–${s.endAge}).` });
    }
  }

  // ── Income ──
  if (s.pensionAmount > 0 && s.pensionStartAge > s.endAge) {
    errors.push({ card: 'income', field: 'pensionStartAge', message: `Pension starts at age ${s.pensionStartAge}, which is after your plan-through age of ${s.endAge}. It will never pay out.` });
  }

  for (const src of s.otherIncomeSources) {
    if (src.startAge > src.endAge) {
      errors.push({ card: 'income', field: `otherIncome.${src.id}`, message: `"${src.name || 'Unnamed'}" start age (${src.startAge}) is after its end age (${src.endAge}).` });
    }
  }

  if (s.spouse?.enabled) {
    if (s.spouse.pensionAmount > 0 && s.spouse.pensionStartAge > s.endAge) {
      errors.push({ card: 'income', field: 'spouse.pensionStartAge', message: `Spouse's pension starts at age ${s.spouse.pensionStartAge}, which is past the plan-through age.` });
    }
  }

  // ── Withdrawal Strategy ──
  if (s.rothConversion?.enabled) {
    if (s.rothConversion.startAge > s.rothConversion.endAge) {
      errors.push({ card: 'withdrawal', field: 'rothConversion.startAge', message: 'Roth conversion start age must not be after the end age.' });
    }
  }

  if (s.guardrails?.enabled) {
    for (let i = 0; i < s.guardrails.tiers.length; i++) {
      const t = s.guardrails.tiers[i];
      if (t.drawdownPct < 0 || t.drawdownPct > 100) {
        errors.push({ card: 'withdrawal', field: `guardrails.tiers.${i}.drawdownPct`, message: `Guardrail tier ${i + 1} drawdown trigger must be between 0% and 100%.` });
      }
      if (t.spendingCutPct < 0 || t.spendingCutPct > 100) {
        errors.push({ card: 'withdrawal', field: `guardrails.tiers.${i}.spendingCutPct`, message: `Guardrail tier ${i + 1} spending cut must be between 0% and 100%.` });
      }
    }
  }

  return errors;
}

/** Get the set of card IDs that have errors */
export function getErrorCards(errors: ValidationError[]): Set<string> {
  return new Set(errors.map(e => e.card));
}

/** Check if a specific field (dot-path prefix match) has an error */
export function hasFieldError(errors: ValidationError[], fieldPrefix: string): boolean {
  return errors.some(e => e.field === fieldPrefix || e.field.startsWith(fieldPrefix + '.'));
}
