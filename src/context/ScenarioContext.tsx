import React, { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { ScenarioInput } from '../types';
import { ASSET_CLASSES, ACCOUNT_TYPES } from '../types';
import { DEFAULT_SCENARIO } from '../constants/defaults';
import { DEFAULT_ASSET_RETURNS, RISK_PROFILES } from '../constants/asset-classes';
import { loadWorkingState, saveWorkingState } from '../utils/storage';

type Action =
  | { type: 'SET_FIELD'; path: string; value: unknown }
  | { type: 'LOAD_SCENARIO'; scenario: ScenarioInput }
  | { type: 'RESET' };

function setNestedField(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const result = { ...obj };
  let current: Record<string, unknown> = result;
  const defaults = DEFAULT_SCENARIO as unknown as Record<string, unknown>;
  let currentDefault: Record<string, unknown> = defaults;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const defaultVal = currentDefault?.[key] as Record<string, unknown> | undefined;
    // If the current value is missing, seed it from defaults so all sibling fields are present
    current[key] = { ...(defaultVal ?? {}), ...(current[key] as Record<string, unknown> ?? {}) };
    current = current[key] as Record<string, unknown>;
    currentDefault = defaultVal ?? {} as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

function reducer(state: ScenarioInput, action: Action): ScenarioInput {
  switch (action.type) {
    case 'SET_FIELD':
      return setNestedField(state as unknown as Record<string, unknown>, action.path, action.value) as unknown as ScenarioInput;
    case 'LOAD_SCENARIO':
      return { ...action.scenario };
    case 'RESET':
      return { ...DEFAULT_SCENARIO };
    default:
      return state;
  }
}

interface ScenarioContextType {
  scenario: ScenarioInput;
  dispatch: React.Dispatch<Action>;
  setField: (path: string, value: unknown) => void;
  loadScenario: (s: ScenarioInput) => void;
  reset: () => void;
}

const ScenarioContext = createContext<ScenarioContextType | null>(null);

function getInitialState(): ScenarioInput {
  const saved = loadWorkingState();
  if (!saved) return DEFAULT_SCENARIO;
  // Merge defaults for any missing top-level fields (handles old localStorage data)
  return { ...DEFAULT_SCENARIO, ...saved };
}

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, dispatch] = useReducer(reducer, null, getInitialState);

  // Patch in-memory state if asset classes or account types were added (handles HMR / stale state)
  useEffect(() => {
    const alloc = scenario.investments?.preRetirement?.traditional401k;
    const returns = scenario.investments?.assetClassReturns;
    const preRet = scenario.investments?.preRetirement as Record<string, unknown> | undefined;
    const needsPatch =
      (alloc && ASSET_CLASSES.some(ac => !(ac in alloc))) ||
      (returns && ASSET_CLASSES.some(ac => !(ac in returns))) ||
      (preRet && ACCOUNT_TYPES.some(acct => !(acct in preRet))) ||
      (scenario.balances && ACCOUNT_TYPES.some(acct => !(acct in (scenario.balances as Record<string, unknown>)))) ||
      (scenario.contributionAllocation && ACCOUNT_TYPES.some(acct => !(acct in (scenario.contributionAllocation as Record<string, unknown>)))) ||
      (scenario.taxBracketInflationRate == null) ||
      (!scenario.filingStatus) ||
      (!scenario.socialSecurityMode) ||
      (!scenario.stateCode) ||
      (!scenario.healthcare) ||
      (!scenario.rothConversion) ||
      (!scenario.cashBuffer) ||
      (!scenario.spouse) ||
      (!scenario.jobs) ||
      (!scenario.housing) ||
      (scenario.inflationVolatility == null) ||
      (scenario.rothContributionBasis == null) ||
      (scenario.ruleof55Eligible == null) ||
      (!scenario.visibleAccounts);
    if (needsPatch) {
      const patched = { ...scenario };
      // Patch asset allocations
      for (const phase of ['preRetirement', 'postRetirement'] as const) {
        const p = patched.investments[phase] as Record<string, Record<string, number>>;
        for (const key of Object.keys(p)) {
          for (const ac of ASSET_CLASSES) {
            if (!(ac in p[key])) p[key][ac] = 0;
          }
        }
        // Add missing account types
        const defaultAlloc = RISK_PROFILES[patched.investments.riskProfile ?? 'balanced'];
        for (const acct of ACCOUNT_TYPES) {
          if (!(acct in p)) {
            p[acct] = { ...defaultAlloc };
          }
        }
      }
      for (const ac of ASSET_CLASSES) {
        if (!(ac in patched.investments.assetClassReturns)) {
          (patched.investments.assetClassReturns as Record<string, unknown>)[ac] =
            { ...DEFAULT_ASSET_RETURNS[ac] };
        }
      }
      // Patch balances and contribution allocation
      for (const acct of ACCOUNT_TYPES) {
        if (!(acct in (patched.balances as Record<string, number>))) {
          (patched.balances as Record<string, number>)[acct] = 0;
        }
        if (!(acct in (patched.contributionAllocation as Record<string, number>))) {
          (patched.contributionAllocation as Record<string, number>)[acct] = 0;
        }
      }
      // Patch missing scalar fields
      if (patched.taxBracketInflationRate == null) {
        patched.taxBracketInflationRate = 0.02;
      }
      if (!patched.filingStatus) {
        (patched as Record<string, unknown>).filingStatus = 'hoh';
      }
      if (!patched.socialSecurityMode) {
        (patched as Record<string, unknown>).socialSecurityMode = 'manual';
      }
      if (!patched.stateCode) {
        (patched as Record<string, unknown>).stateCode = 'IA';
      }
      if (!patched.healthcare) {
        (patched as Record<string, unknown>).healthcare = {
          enabled: false,
          preMedicareMonthly: 1500,
          medicareMonthly: 500,
          lateLifeMonthly: 1000,
          medicareStartAge: 65,
          lateLifeStartAge: 80,
          inflationRate: 0.05,
        };
      }
      if (!patched.cashBuffer) {
        (patched as Record<string, unknown>).cashBuffer = {
          enabled: false,
          yearsOfExpenses: 3,
          refillInUpMarkets: true,
        };
      }
      if (!patched.rothConversion) {
        (patched as Record<string, unknown>).rothConversion = {
          enabled: false,
          strategy: 'fillBracket',
          targetBracketRate: 0.12,
          fixedAnnualAmount: 50000,
          startAge: 65,
          endAge: 72,
        };
      }
      if (!patched.spouse) {
        (patched as Record<string, unknown>).spouse = {
          enabled: false,
          currentAge: 33,
          socialSecurityBenefit: 1500,
          socialSecurityClaimAge: 67,
        };
      } else {
        // Patch spouse SS fields if missing from old data
        const sp = patched.spouse as unknown as Record<string, unknown>;
        if (sp.socialSecurityBenefit == null) sp.socialSecurityBenefit = 1500;
        if (sp.socialSecurityClaimAge == null) sp.socialSecurityClaimAge = 67;
      }
      // New fields migration
      if (patched.ruleof55Eligible == null) {
        (patched as Record<string, unknown>).ruleof55Eligible = false;
      }
      if (patched.rothContributionBasis == null) {
        (patched as Record<string, unknown>).rothContributionBasis = 0;
      }
      if (!patched.pensionType) {
        (patched as Record<string, unknown>).pensionType = 'annuity';
      }
      if (!patched.pensionLumpSumAccount) {
        (patched as Record<string, unknown>).pensionLumpSumAccount = 'traditionalIRA';
      }
      if (!patched.jobs) {
        // Migrate from old currentSalary format
        const raw = patched as unknown as Record<string, unknown>;
        const oldSalary = (raw.currentSalary as number) ?? 0;
        const oldMatchRate = (raw.employerMatchRate as number) ?? 0;
        const oldMatchCap = (raw.employerMatchCapPct as number) ?? 0;
        (patched as Record<string, unknown>).jobs = [
          {
            id: 'migrated-primary',
            name: 'Primary Job',
            monthlyPay: oldSalary,
            startAge: patched.currentAge,
            endAge: patched.retirementAge,
            has401k: true,
            employerMatchRate: oldMatchRate,
            employerMatchCapPct: oldMatchCap,
          },
        ];
      }
      if (!patched.housing) {
        (patched as Record<string, unknown>).housing = {
          enabled: false,
          mortgagePayment: 1500,
          payoffAge: 65,
          downsizingProceeds: 0,
          downsizingAge: 70,
        };
      }
      if (patched.inflationVolatility == null) {
        (patched as Record<string, unknown>).inflationVolatility = 0.015;
      }
      if (!patched.visibleAccounts) {
        const visible = new Set<string>(['traditional401k', 'cashAccount']);
        for (const acct of ACCOUNT_TYPES) {
          if ((patched.balances as Record<string, number>)[acct] > 0) visible.add(acct);
          if ((patched.contributionAllocation as Record<string, number>)[acct] > 0) visible.add(acct);
        }
        (patched as Record<string, unknown>).visibleAccounts = ACCOUNT_TYPES.filter(a => visible.has(a));
      }
      dispatch({ type: 'LOAD_SCENARIO', scenario: patched });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save working state on every change
  useEffect(() => {
    saveWorkingState(scenario);
  }, [scenario]);

  const setField = (path: string, value: unknown) =>
    dispatch({ type: 'SET_FIELD', path, value });

  const loadScenario = (s: ScenarioInput) =>
    dispatch({ type: 'LOAD_SCENARIO', scenario: s });

  const reset = () => dispatch({ type: 'RESET' });

  return (
    <ScenarioContext.Provider value={{ scenario, dispatch, setField, loadScenario, reset }}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error('useScenario must be inside ScenarioProvider');
  return ctx;
}
