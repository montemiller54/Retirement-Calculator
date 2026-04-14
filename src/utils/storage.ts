import type { SavedScenario, ScenarioInput } from '../types';
import { ASSET_CLASSES, ACCOUNT_TYPES } from '../types';
import { DEFAULT_ASSET_RETURNS, makeUniformAllocations, RISK_PROFILES } from '../constants/asset-classes';

const STORAGE_KEY = 'retirement-planner-scenarios';
const WORKING_KEY = 'retirement-planner-working';

/**
 * Migrate a loaded scenario to ensure all current asset classes and account types are present.
 * Old saved data may lack newer asset classes (e.g. 'crypto') or account types (e.g. 'cashAccount').
 */
function migrateScenario(s: ScenarioInput): ScenarioInput {
  const patchAlloc = (alloc: Record<string, number>): Record<string, number> => {
    for (const ac of ASSET_CLASSES) {
      if (!(ac in alloc)) {
        alloc[ac] = 0;
      }
    }
    return alloc;
  };

  // Patch investment allocations and returns
  if (s.investments) {
    for (const phase of ['preRetirement', 'postRetirement'] as const) {
      const phaseAllocs = s.investments[phase] as Record<string, Record<string, number>>;
      if (phaseAllocs) {
        // Patch existing accounts' asset allocations
        for (const key of Object.keys(phaseAllocs)) {
          patchAlloc(phaseAllocs[key]);
        }
        // Add missing account types with default allocation
        const defaultAlloc = RISK_PROFILES[s.investments.riskProfile ?? 'balanced'];
        for (const acct of ACCOUNT_TYPES) {
          if (!(acct in phaseAllocs)) {
            phaseAllocs[acct] = { ...defaultAlloc };
          }
        }
      }
    }
    // Patch assetClassReturns
    if (s.investments.assetClassReturns) {
      for (const ac of ASSET_CLASSES) {
        if (!(ac in s.investments.assetClassReturns)) {
          (s.investments.assetClassReturns as Record<string, unknown>)[ac] =
            { ...DEFAULT_ASSET_RETURNS[ac] };
        }
      }
    }
  }

  // Patch balances — add missing account types with 0
  if (s.balances) {
    for (const acct of ACCOUNT_TYPES) {
      if (!(acct in (s.balances as Record<string, number>))) {
        (s.balances as Record<string, number>)[acct] = 0;
      }
    }
  }

  // Patch contributionAllocation — add missing account types with 0
  if (s.contributionAllocation) {
    for (const acct of ACCOUNT_TYPES) {
      if (!(acct in (s.contributionAllocation as Record<string, number>))) {
        (s.contributionAllocation as Record<string, number>)[acct] = 0;
      }
    }
  }

  // Patch missing scalar fields with defaults
  if (s.taxBracketInflationRate == null) {
    s.taxBracketInflationRate = 0.02;
  }

  // Patch filing status
  if (!s.filingStatus) {
    (s as unknown as Record<string, unknown>).filingStatus = 'hoh';
  }

  // Patch socialSecurityMode (default to manual for existing saved scenarios)
  if (!s.socialSecurityMode) {
    (s as unknown as Record<string, unknown>).socialSecurityMode = 'manual';
  }

  // Patch state code
  if (!s.stateCode) {
    (s as unknown as Record<string, unknown>).stateCode = 'IA';
  }

  // Patch healthcare costs
  if (!s.healthcare) {
    (s as unknown as Record<string, unknown>).healthcare = {
      enabled: false,
      preMedicareMonthly: 1500,
      medicareMonthly: 500,
      lateLifeMonthly: 1000,
      medicareStartAge: 65,
      lateLifeStartAge: 80,
      inflationRate: 0.05,
    };
  }

  // Patch cash buffer
  if (!s.cashBuffer) {
    (s as unknown as Record<string, unknown>).cashBuffer = {
      enabled: false,
      yearsOfExpenses: 3,
      refillInUpMarkets: true,
    };
  }

  // Patch Roth conversion
  if (!s.rothConversion) {
    (s as unknown as Record<string, unknown>).rothConversion = {
      enabled: false,
      strategy: 'fillBracket',
      targetBracketRate: 0.12,
      fixedAnnualAmount: 50000,
      startAge: 65,
      endAge: 72,
    };
  }

  // Patch spouse config
  if (!s.spouse) {
    (s as unknown as Record<string, unknown>).spouse = {
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
    };
  }

  // Migrate old asset class names: usStocks+intlStocks→stocks, usBonds→bonds
  const migrateAlloc = (alloc: Record<string, number>): void => {
    if ('usStocks' in alloc || 'intlStocks' in alloc) {
      alloc.stocks = (alloc.usStocks ?? 0) + (alloc.intlStocks ?? 0);
      delete alloc.usStocks;
      delete alloc.intlStocks;
    }
    if ('usBonds' in alloc) {
      alloc.bonds = alloc.usBonds;
      delete alloc.usBonds;
    }
  };
  if (s.investments) {
    for (const phase of ['preRetirement', 'postRetirement'] as const) {
      const phaseAllocs = s.investments[phase] as Record<string, Record<string, number>>;
      if (phaseAllocs) {
        for (const key of Object.keys(phaseAllocs)) {
          migrateAlloc(phaseAllocs[key]);
        }
      }
    }
    if (s.investments.assetClassReturns) {
      const ret = s.investments.assetClassReturns as Record<string, unknown>;
      if ('usStocks' in ret || 'intlStocks' in ret) {
        ret.stocks = ret.usStocks ?? ret.stocks;
        delete ret.usStocks;
        delete ret.intlStocks;
      }
      if ('usBonds' in ret) {
        ret.bonds = ret.usBonds ?? ret.bonds;
        delete ret.usBonds;
      }
    }
  }

  return s;
}

/** Save the current working state (auto-saved on every change) */
export function saveWorkingState(scenario: ScenarioInput): void {
  try {
    localStorage.setItem(WORKING_KEY, JSON.stringify(scenario));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Load the last working state, or null if none */
export function loadWorkingState(): ScenarioInput | null {
  try {
    const data = localStorage.getItem(WORKING_KEY);
    if (!data) return null;
    return migrateScenario(JSON.parse(data));
  } catch {
    return null;
  }
}

export function loadScenarios(): SavedScenario[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const scenarios: SavedScenario[] = JSON.parse(data);
    return scenarios.map(s => ({ ...s, input: migrateScenario(s.input) }));
  } catch {
    return [];
  }
}

export function saveScenario(scenario: ScenarioInput): SavedScenario {
  const scenarios = loadScenarios();
  const existing = scenarios.findIndex(s => s.name === scenario.name);
  const saved: SavedScenario = {
    id: existing >= 0 ? scenarios[existing].id : crypto.randomUUID(),
    name: scenario.name,
    input: scenario,
    savedAt: new Date().toISOString(),
  };

  if (existing >= 0) {
    scenarios[existing] = saved;
  } else {
    scenarios.push(saved);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  return saved;
}

export function deleteScenario(id: string): void {
  const scenarios = loadScenarios().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

export function exportScenario(scenario: ScenarioInput): string {
  return JSON.stringify(scenario, null, 2);
}

export function importScenario(json: string): ScenarioInput {
  return migrateScenario(JSON.parse(json) as ScenarioInput);
}

export function downloadJSON(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
