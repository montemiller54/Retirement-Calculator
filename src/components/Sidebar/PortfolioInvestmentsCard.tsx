import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import {
  ACCOUNT_TYPES, ACCOUNT_LABELS, ASSET_CLASSES, ASSET_CLASS_LABELS,
  type AssetAllocation, type AccountType, type RiskProfile,
} from '../../types';
import { RISK_PROFILES, RISK_PROFILE_LABELS, makeUniformAllocations, DEFAULT_ASSET_RETURNS } from '../../constants/asset-classes';
import { CurrencyInput } from './CurrencyInput';
import { PercentInput } from './PercentInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-500'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

// ── Variability scale: 1–10 (0.5 steps) ↔ stdDev (decimal) ──
// Curve: vol = 0.01 + ((v-1)/9)^1.6888 * 0.59
// Calibrated so v=1→1%, v=3→6%, v=5→16%, v=9→50%, v=10→60%
function variabilityToStdDev(v: number): number {
  return 0.01 + Math.pow((v - 1) / 9, 1.6888) * 0.59;
}
function stdDevToVariability(sd: number): number {
  if (sd <= 0.01) return 1;
  const raw = 1 + Math.pow((sd - 0.01) / 0.59, 1 / 1.6888) * 9;
  return Math.round(Math.min(10, Math.max(1, raw)) * 2) / 2;
}

// ── Crash frequency scale: 1–10 (0.5 steps) ↔ df (3–30) ──
// Linear inversion: 1→30, 10→3
function crashFreqToDf(cf: number): number {
  return Math.round(30 - (cf - 1) * (27 / 9));
}
function dfToCrashFreq(df: number): number {
  const raw = 1 + (30 - df) * (9 / 27);
  return Math.round(raw * 2) / 2; // snap to 0.5
}

export function PortfolioInvestmentsCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const inv = scenario.investments;
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const [activeSection, setActiveSection] = useState<'balances' | 'allocations' | 'returns'>('balances');

  const totalBalance = ACCOUNT_TYPES.reduce((s, a) => s + scenario.balances[a], 0);

  const handleRiskProfile = (profile: RiskProfile) => {
    setField('investments.riskProfile', profile);
    setField('investments.preRetirement', makeUniformAllocations(RISK_PROFILES[profile]));
    const postMap: Record<RiskProfile, RiskProfile> = {
      aggressive: 'balanced',
      balanced: 'conservative',
      conservative: 'conservative',
    };
    setField('investments.postRetirement', makeUniformAllocations(RISK_PROFILES[postMap[profile]]));
  };

  const currentAllocations = phase === 'pre' ? inv.preRetirement : inv.postRetirement;
  const allocField = phase === 'pre' ? 'investments.preRetirement' : 'investments.postRetirement';

  const setAccountAlloc = (acct: AccountType, ac: string, val: number) => {
    const current = { ...currentAllocations[acct] };
    current[ac as keyof AssetAllocation] = val;
    setField(`${allocField}.${acct}`, current);
  };

  const sectionBtn = (id: 'balances' | 'allocations' | 'returns', label: string) => {
    const isOpen = activeSection === id;
    return (
      <button
        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-md border transition-colors ${
          isOpen
            ? 'bg-primary-50 dark:bg-primary-900/50 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 font-medium'
            : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60'
        }`}
        onClick={() => setActiveSection(id)}
      >
        <span>{label}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isOpen ? 'text-primary-500' : 'text-gray-400'}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    );
  };

  return (
    <div className="space-y-1">
      {/* ── Account Balances ── */}
      {sectionBtn('balances', 'Account Balances')}
      {activeSection === 'balances' && (
        <div className="px-1 pb-2 space-y-2">
          <div className="space-y-1">
            {ACCOUNT_TYPES.map(acct => (
              <div key={acct} className="flex items-center gap-2">
                <span className="text-[11px] w-28 truncate text-gray-600 dark:text-gray-400" title={ACCOUNT_LABELS[acct]}>
                  {ACCOUNT_LABELS[acct]}
                </span>
                <span className="text-[11px] text-gray-400">$</span>
                <CurrencyInput
                  className="flex-1"
                  value={scenario.balances[acct]}
                  onChange={v => setField(`balances.${acct}`, v)}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500">Total Portfolio</span>
            <span className="font-semibold text-primary-600 dark:text-primary-400">
              ${totalBalance.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
            <div className="flex-1">
              <label className="input-label">Taxable Cost Basis</label>
              <p className="text-[10px] text-gray-400">% of taxable balance that is original cost</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="range"
                className="w-20 h-1.5 accent-primary-600"
                min={0} max={100} step={5}
                value={Math.round(scenario.taxableCostBasisPct * 100)}
                onChange={e => setField('taxableCostBasisPct', parseInt(e.target.value) / 100)}
              />
              <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 w-8 text-right">
                {Math.round(scenario.taxableCostBasisPct * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Allocations ── */}
      {sectionBtn('allocations', 'Allocations')}
      {activeSection === 'allocations' && (
        <div className="px-1 pb-2 space-y-3">
          <div className="flex gap-1">
            {(['simple', 'advanced'] as const).map(m => (
              <button
                key={m}
                className={`flex-1 text-xs py-1.5 rounded border ${
                  inv.mode === m
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                onClick={() => setField('investments.mode', m)}
              >
                {m === 'simple' ? 'Simple' : 'Advanced'}
              </button>
            ))}
          </div>

          {inv.mode === 'simple' ? (
            <div className="space-y-2">
              <label className="input-label">Risk Profile</label>
              <div className="flex gap-1">
                {(['conservative', 'balanced', 'aggressive'] as RiskProfile[]).map(p => (
                  <button
                    key={p}
                    className={`flex-1 text-xs py-1.5 rounded border ${
                      inv.riskProfile === p
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    onClick={() => handleRiskProfile(p)}
                  >
                    {RISK_PROFILE_LABELS[p]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400">
                {RISK_PROFILES[inv.riskProfile].stocks}% Stocks / {RISK_PROFILES[inv.riskProfile].bonds}% Bonds / {RISK_PROFILES[inv.riskProfile].cash}% Cash / {RISK_PROFILES[inv.riskProfile].crypto}% Crypto
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-1">
                {(['pre', 'post'] as const).map(p => (
                  <button
                    key={p}
                    className={`flex-1 text-xs py-1 rounded ${phase === p ? 'bg-gray-200 dark:bg-gray-700 font-medium' : 'text-gray-500'}`}
                    onClick={() => setPhase(p)}
                  >
                    {p === 'pre' ? 'Pre-Retirement' : 'Post-Retirement'}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr>
                      <th className="text-left py-0.5">Account</th>
                      {ASSET_CLASSES.map(ac => (
                        <th key={ac} className="text-center py-0.5 px-1">{ASSET_CLASS_LABELS[ac]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ACCOUNT_TYPES.map(acct => {
                      const alloc = currentAllocations[acct];
                      const sum = ASSET_CLASSES.reduce((s, ac) => s + alloc[ac], 0);
                      return (
                        <tr key={acct} className={sum !== 100 ? 'bg-red-50 dark:bg-red-900/20' : ''}>
                          <td className="py-0.5 truncate max-w-[80px]" title={ACCOUNT_LABELS[acct]}>
                            {ACCOUNT_LABELS[acct]}
                          </td>
                          {ASSET_CLASSES.map(ac => (
                            <td key={ac} className="px-0.5 text-center">
                              <input
                                type="number"
                                className="input-field w-12 text-center text-[10px] py-0.5 px-1"
                                min={0} max={100}
                                value={alloc[ac]}
                                onChange={e => setAccountAlloc(acct, ac, parseInt(e.target.value) || 0)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {ve.filter(e => e.field.startsWith('investments.preRetirement') || e.field.startsWith('investments.postRetirement')).map((err, i) => (
                <p key={i} className="text-[10px] text-red-500 mt-1">{err.message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Rate Assumptions ── */}
      {sectionBtn('returns', 'Rate Assumptions')}
      {activeSection === 'returns' && (
        <div className="px-1 pb-2 space-y-2">
          <p className="text-[10px] text-gray-400">Expected nominal returns and variability by asset class.</p>
          <div className="space-y-1.5">
            {/* Column headers */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] w-14"></span>
              <span className="text-[10px] text-gray-400 w-20 text-right">Avg Return %</span>
              <span className="text-[10px] text-gray-400 flex-1 text-center">Variability</span>
            </div>
            {ASSET_CLASSES.map(ac => {
              const ret = inv.assetClassReturns[ac] ?? DEFAULT_ASSET_RETURNS[ac];
              const varVal = stdDevToVariability(ret.stdDev);
              const varLabel = varVal <= 2 ? 'Very Low' : varVal <= 3.5 ? 'Low' : varVal <= 6 ? 'Medium' : varVal <= 8 ? 'High' : 'Very High';
              return (
                <div key={ac} className="flex items-center gap-1">
                  <span className="text-[11px] w-14 truncate">{ASSET_CLASS_LABELS[ac]}</span>
                  <PercentInput
                    className="input-field w-20 text-right text-[11px]"
                    value={ret.mean}
                    onChange={v => setField(`investments.assetClassReturns.${ac}.mean`, v)}
                  />
                  <div className="flex-1 flex items-center justify-center gap-1">
                    <input
                      type="range"
                      className="w-[50%] h-1.5 accent-primary-600"
                      min={1} max={10} step={0.5}
                      value={varVal}
                      onChange={e => setField(`investments.assetClassReturns.${ac}.stdDev`, variabilityToStdDev(parseFloat(e.target.value)))}
                    />
                    <span className="text-[10px] text-gray-500 whitespace-nowrap w-20">{varVal.toFixed(1)} {varLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <label className="input-label mb-1">Crash Frequency</label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400">Low</span>
              <input
                type="range"
                className={`flex-1 h-1.5 accent-primary-600 ${fieldErrorClass(ve, 'investments.fatTailDf')}`}
                min={1} max={10} step={0.5}
                value={dfToCrashFreq(inv.fatTailDf)}
                onChange={e => setField('investments.fatTailDf', crashFreqToDf(parseFloat(e.target.value)))}
              />
              <span className="text-[10px] text-gray-400">High</span>
              <span className="text-[10px] text-gray-500 w-6 text-right">{dfToCrashFreq(inv.fatTailDf).toFixed(1)}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              How often extreme market crashes occur in simulations.
            </p>
          </div>
          <FieldError errors={ve} field="investments.fatTailDf" />
        </div>
      )}
    </div>
  );
}
