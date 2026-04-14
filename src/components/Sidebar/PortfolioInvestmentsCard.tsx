import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import {
  ACCOUNT_TYPES, ACCOUNT_LABELS, ASSET_CLASSES, ASSET_CLASS_LABELS,
  type AssetAllocation, type AccountType, type RiskProfile,
} from '../../types';
import { RISK_PROFILES, RISK_PROFILE_LABELS, makeUniformAllocations, DEFAULT_ASSET_RETURNS } from '../../constants/asset-classes';
import { CurrencyInput } from './CurrencyInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`relative inline-flex w-9 h-5 rounded-full border transition-colors ${checked ? 'bg-primary-500 border-primary-500' : 'bg-gray-300 border-gray-300 dark:bg-gray-500 dark:border-gray-400'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

export function PortfolioInvestmentsCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const inv = scenario.investments;
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const [showReturns, setShowReturns] = useState(false);

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

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] text-gray-400 mb-3">Account balances and investment strategy.</p>

        {/* Account balances */}
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
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="text-gray-500">Total Portfolio</span>
          <span className="font-semibold text-primary-600 dark:text-primary-400">
            ${totalBalance.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Cost basis */}
      <div className="flex items-center justify-between">
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

      {/* Investment mode toggle */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
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
                          <td key={ac} className="px-0.5">
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

        {/* Return assumptions — collapsible */}
        <button
          className="w-full flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 pt-2 border-t border-gray-100 dark:border-gray-700"
          onClick={() => setShowReturns(!showReturns)}
        >
          <span>Return assumptions</span>
          <span>{showReturns ? '▾' : '▸'}</span>
        </button>

        {showReturns && (
          <div className="space-y-1">
            {ASSET_CLASSES.map(ac => {
              const ret = inv.assetClassReturns[ac] ?? DEFAULT_ASSET_RETURNS[ac];
              return (
                <div key={ac} className="flex items-center gap-2">
                  <span className="text-[11px] w-16 truncate">{ASSET_CLASS_LABELS[ac]}</span>
                  <div>
                    <label className="input-label">Mean %</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input-field w-14 text-right"
                      value={(ret.mean * 100).toFixed(1)}
                      onChange={e => setField(`investments.assetClassReturns.${ac}.mean`, (parseFloat(e.target.value) || 0) / 100)}
                    />
                  </div>
                  <div>
                    <label className="input-label">Vol %</label>
                    <input
                      type="number"
                      step="0.1"
                      className={`input-field w-14 text-right ${fieldErrorClass(ve, `investments.assetClassReturns.${ac}.stdDev`)}`}
                      value={(ret.stdDev * 100).toFixed(1)}
                      onChange={e => setField(`investments.assetClassReturns.${ac}.stdDev`, (parseFloat(e.target.value) || 0) / 100)}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2 mt-1">
              <label className="input-label mb-0">Market Volatility:</label>
              <input
                type="number"
                className={`input-field w-14 ${fieldErrorClass(ve, 'investments.fatTailDf')}`}
                min={3} max={30}
                value={inv.fatTailDf}
                onChange={e => setField('investments.fatTailDf', parseInt(e.target.value) || 6)}
              />
              <span className="text-[10px] text-gray-400">
                {inv.fatTailDf <= 5 ? 'Extreme' : inv.fatTailDf <= 9 ? 'High' : inv.fatTailDf <= 15 ? 'Moderate' : 'Low'}
              </span>
            </div>
            <FieldError errors={ve} field="investments.fatTailDf" />
          </div>
        )}
      </div>
    </div>
  );
}
