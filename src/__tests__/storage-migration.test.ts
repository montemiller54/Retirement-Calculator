import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  importScenario, exportScenario,
  saveScenario, loadScenarios, deleteScenario, updateScenarioById,
  saveWorkingState, loadWorkingState,
  saveActivePlanId, loadActivePlanId,
} from '../utils/storage';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import { DEFAULT_VOLATILITY, DEFAULT_CRASH_FREQUENCY } from '../constants/asset-classes';
import { runSimulation } from '../engine/simulation';

/**
 * Storage & migration tests. Migrations rewrite users' saved plans on load —
 * a bug here silently corrupts data, so each legacy shape gets its own test.
 * Fixtures are intentionally malformed and go through importScenario (JSON →
 * migrateScenario), the same path loadScenarios/loadWorkingState use.
 */

// A representative pre-jobs, pre-crypto, pre-spouse era save
function legacyFixture(): Record<string, unknown> {
  const oldAlloc = { usStocks: 40, intlStocks: 20, usBonds: 30, cash: 10 };
  const oldAccounts = ['traditional401k', 'roth401k', 'traditionalIRA', 'rothIRA', 'taxable', 'hsa'];
  return {
    name: 'Legacy Plan',
    currentAge: 50,
    retirementAge: 60,
    endAge: 90,
    currentSalary: 8000,
    employerMatchRate: 0.5,
    employerMatchCapPct: 0.06,
    salaryGrowthRate: 0.03,
    totalSavingsRate: 0.15,
    contributionAllocation: {
      traditional401k: 60, roth401k: 0, traditionalIRA: 0,
      rothIRA: 20, taxable: 20, hsa: 0,
    },
    enable401kCatchUp: false,
    enableIRACatchUp: false,
    limit401k: 23000,
    limitIRA: 7000,
    balances: {
      traditional401k: 400000, roth401k: 0, traditionalIRA: 0,
      rothIRA: 50000, taxable: 100000, hsa: 0,
    },
    taxableCostBasisPct: 0.7,
    baseAnnualSpending: 5000,
    spendingInflationRate: 0.025,
    oneTimeExpenses: [],
    socialSecurityBenefit: 2000,
    socialSecurityClaimAge: 67,
    socialSecurityCOLA: 0.02,
    pensionAmount: 0,
    pensionStartAge: 65,
    pensionCOLA: 0,
    pensionType: 'annuity',
    pensionLumpSumAccount: 'traditionalIRA',
    otherIncomeSources: [],
    investments: {
      mode: 'simple',
      riskProfile: 'balanced',
      preRetirement: Object.fromEntries(oldAccounts.map(a => [a, { ...oldAlloc }])),
      postRetirement: Object.fromEntries(oldAccounts.map(a => [a, { ...oldAlloc }])),
      assetClassReturns: {
        usStocks: { mean: 0.09, stdDev: 0.22 },
        usBonds: { mean: 0.04, stdDev: 0.08 },
        cash: { mean: 0.03, stdDev: 0.02 },
      },
      fatTailDf: 3,
    },
    withdrawalStrategy: 'taxEfficient',
  };
}

const importFixture = (f: Record<string, unknown>) => importScenario(JSON.stringify(f));

describe('Scenario migration (importScenario path)', () => {
  it('a current-format scenario round-trips losslessly', () => {
    const roundTripped = importScenario(exportScenario(DEFAULT_SCENARIO));
    expect(roundTripped).toEqual(DEFAULT_SCENARIO);
  });

  it('renames legacy monthly-valued fields (baseAnnualSpending, annualAmount)', () => {
    const fixture = legacyFixture();
    (fixture as Record<string, unknown>).otherIncomeSources = [
      { id: 'r', name: 'rental', annualAmount: 900, startAge: 60, endAge: 70, inflationRate: 0.02 },
    ];
    const s = importFixture(fixture);
    expect(s.baseMonthlySpending).toBe(5000);
    expect((s as unknown as Record<string, unknown>).baseAnnualSpending).toBeUndefined();
    expect(s.otherIncomeSources[0].monthlyAmount).toBe(900);
    expect((s.otherIncomeSources[0] as unknown as Record<string, unknown>).annualAmount).toBeUndefined();
  });

  it('strips removed catch-up toggle fields (enable401kCatchUp, enableIRACatchUp)', () => {
    const s = importFixture(legacyFixture()) as unknown as Record<string, unknown>;
    // Fields were removed; catch-up is now always applied when age-eligible
    expect(s.enable401kCatchUp).toBeUndefined();
    expect(s.enableIRACatchUp).toBeUndefined();
  });

  it('migrates legacy currentSalary/match fields into a jobs array', () => {
    const s = importFixture(legacyFixture());
    expect(s.jobs).toHaveLength(1);
    const job = s.jobs[0];
    expect(job.monthlyPay).toBe(8000);
    expect(job.startAge).toBe(50);
    expect(job.endAge).toBe(60);
    expect(job.employerMatchRate).toBe(0.5);
    expect(job.employerMatchCapPct).toBe(0.06);
    expect(job.owner).toBe('primary');
    expect(job.has401k).toBe(true);
    // Old fields removed
    const raw = s as unknown as Record<string, unknown>;
    expect(raw.currentSalary).toBeUndefined();
    expect(raw.employerMatchRate).toBeUndefined();
    expect(raw.employerMatchCapPct).toBeUndefined();
  });

  it('migrates old asset-class names (usStocks+intlStocks→stocks, usBonds→bonds)', () => {
    const s = importFixture(legacyFixture());
    const pre = s.investments.preRetirement.traditional401k as Record<string, number>;
    expect(pre.stocks).toBe(60); // 40 + 20
    expect(pre.bonds).toBe(30);
    expect(pre.usStocks).toBeUndefined();
    expect(pre.intlStocks).toBeUndefined();
    expect(pre.usBonds).toBeUndefined();

    const ret = s.investments.assetClassReturns as Record<string, { mean: number }>;
    expect(ret.stocks.mean).toBe(0.09);
    expect(ret.bonds.mean).toBe(0.04);
    expect(ret.usStocks).toBeUndefined();
    expect(ret.usBonds).toBeUndefined();
    // Newly added asset class gets defaults, and old allocations get 0
    expect(ret.crypto).toBeDefined();
    expect(pre.crypto).toBe(0);
  });

  it('adds missing account types to balances, allocations, and phase allocations', () => {
    const s = importFixture(legacyFixture());
    expect(s.balances.cashAccount).toBe(0);
    expect(s.balances.otherAssets).toBe(0);
    expect(s.contributionAllocation.cashAccount).toBe(0);
    expect(s.investments.preRetirement.cashAccount).toBeDefined();
    expect(s.investments.postRetirement.otherAssets).toBeDefined();
  });

  it('maps fatTailDf endpoints onto the crashFrequency slider and removes the old field', () => {
    const extreme = importFixture(legacyFixture()); // df=3 → most crash-prone
    expect(extreme.investments.crashFrequency).toBe(10);

    const rare = importFixture({ ...legacyFixture(), investments: { ...legacyFixture().investments as object, fatTailDf: 30 } });
    expect(rare.investments.crashFrequency).toBe(1);

    expect((extreme.investments as unknown as Record<string, unknown>).fatTailDf).toBeUndefined();
  });

  it('fills missing scalar fields with defaults', () => {
    const s = importFixture(legacyFixture());
    expect(s.filingStatus).toBe('hoh');
    expect(s.stateCode).toBe('IA');
    expect(s.socialSecurityMode).toBe('manual'); // existing saves keep manual benefits
    expect(s.taxBracketInflationRate).toBe(0.02);
    expect(s.investments.returnOutlook).toBe('moderate');
  });

  it('defaults crashFrequency when neither it nor fatTailDf exists', () => {
    const fixture = legacyFixture();
    delete (fixture.investments as Record<string, unknown>).fatTailDf;
    const s = importFixture(fixture);
    expect(s.investments.crashFrequency).toBe(DEFAULT_CRASH_FREQUENCY);
  });

  it('fills missing nested objects and merges partial ones with defaults', () => {
    const fixture = legacyFixture();
    (fixture as Record<string, unknown>).healthcare = { preMedicareMonthly: 999 };
    const s = importFixture(fixture);

    // Partial object: user value kept, missing fields from defaults
    expect(s.healthcare.preMedicareMonthly).toBe(999);
    expect(s.healthcare.medicareStartAge).toBe(DEFAULT_SCENARIO.healthcare.medicareStartAge);
    // Absent objects: fully defaulted
    expect(s.housing).toEqual(DEFAULT_SCENARIO.housing);
    expect(s.spouse).toEqual(DEFAULT_SCENARIO.spouse);
    expect(s.guardrails).toEqual(DEFAULT_SCENARIO.guardrails);
    expect(s.rothConversion).toEqual(DEFAULT_SCENARIO.rothConversion);
  });

  it('derives visibleAccounts from non-zero balances and allocations', () => {
    const s = importFixture(legacyFixture());
    expect(s.visibleAccounts).toContain('traditional401k'); // always visible
    expect(s.visibleAccounts).toContain('rothIRA');   // balance > 0
    expect(s.visibleAccounts).toContain('taxable');   // balance + allocation > 0
    expect(s.visibleAccounts).not.toContain('hsa');   // zero everywhere
  });

  it('normalizes user-tweaked stdDev back to calibrated defaults', () => {
    const fixture = legacyFixture();
    ((fixture.investments as Record<string, unknown>).assetClassReturns as Record<string, unknown>).usStocks =
      { mean: 0.09, stdDev: 0.99 };
    const s = importFixture(fixture);
    expect(s.investments.assetClassReturns.stocks.stdDev).toBe(DEFAULT_VOLATILITY.stocks);
  });

  it('a migrated legacy scenario runs through the engine without errors', () => {
    const s = importFixture(legacyFixture());
    const result = runSimulation(s, { numSimulations: 10, seed: 42 });
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    expect(result.medianPath.length).toBe(90 - 50 + 1);
  });
});

// ── localStorage-backed persistence ──

function makeLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

describe('localStorage persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveScenario / loadScenarios round trip', () => {
    const saved = saveScenario({ ...DEFAULT_SCENARIO, name: 'Plan A' });
    const loaded = loadScenarios();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(saved.id);
    expect(loaded[0].input).toEqual({ ...DEFAULT_SCENARIO, name: 'Plan A' });
  });

  it('saving the same name replaces in place, keeping the id', () => {
    const first = saveScenario({ ...DEFAULT_SCENARIO, name: 'Plan A' });
    const second = saveScenario({ ...DEFAULT_SCENARIO, name: 'Plan A', currentAge: 40 });
    expect(second.id).toBe(first.id);
    const loaded = loadScenarios();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].input.currentAge).toBe(40);
  });

  it('deleteScenario removes only the matching plan', () => {
    const a = saveScenario({ ...DEFAULT_SCENARIO, name: 'Plan A' });
    saveScenario({ ...DEFAULT_SCENARIO, name: 'Plan B' });
    deleteScenario(a.id);
    const loaded = loadScenarios();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Plan B');
  });

  it('updateScenarioById updates existing and rejects unknown ids', () => {
    const a = saveScenario({ ...DEFAULT_SCENARIO, name: 'Plan A' });
    expect(updateScenarioById(a.id, { ...DEFAULT_SCENARIO, name: 'Plan A2' })).toBe(true);
    expect(loadScenarios()[0].name).toBe('Plan A2');
    expect(updateScenarioById('nope', DEFAULT_SCENARIO)).toBe(false);
  });

  it('working state round trip, applying migrations on load', () => {
    saveWorkingState(DEFAULT_SCENARIO);
    expect(loadWorkingState()).toEqual(DEFAULT_SCENARIO);
    expect(loadActivePlanId()).toBeNull();
    saveActivePlanId('abc');
    expect(loadActivePlanId()).toBe('abc');
    saveActivePlanId(null);
    expect(loadActivePlanId()).toBeNull();
  });

  it('corrupt JSON degrades gracefully instead of throwing', () => {
    localStorage.setItem('retirement-planner-scenarios', '{not json');
    localStorage.setItem('retirement-planner-working', '{not json');
    expect(loadScenarios()).toEqual([]);
    expect(loadWorkingState()).toBeNull();
  });
});
