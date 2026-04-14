import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import {
  ACCOUNT_TYPES, ACCOUNT_LABELS, ASSET_CLASSES, ASSET_CLASS_LABELS,
  type AssetAllocation, type AccountType, type RiskProfile,
} from '../../types';
import { RISK_PROFILES, RISK_PROFILE_LABELS, makeUniformAllocations, DEFAULT_ASSET_RETURNS } from '../../constants/asset-classes';

export function InvestmentSection() {
  const { scenario, setField } = useScenario();
  const inv = scenario.investments;
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');

  const handleRiskProfile = (profile: RiskProfile) => {
    setField('investments.riskProfile', profile);
    setField('investments.preRetirement', makeUniformAllocations(RISK_PROFILES[profile]));
    // For post-retirement, shift one level more conservative
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
    <div className="space-y-3">
      <h3 className="section-title">Investment Assumptions</h3>

      <div className="flex gap-2">
        <button
          className={`text-xs px-2 py-1 rounded ${inv.mode === 'simple' ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-500'}`}
          onClick={() => setField('investments.mode', 'simple')}
        >
          Simple
        </button>
        <button
          className={`text-xs px-2 py-1 rounded ${inv.mode === 'advanced' ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-500'}`}
          onClick={() => setField('investments.mode', 'advanced')}
        >
          Advanced
        </button>
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
            Pre-retirement: {RISK_PROFILES[inv.riskProfile].stocks}% Stocks / {RISK_PROFILES[inv.riskProfile].bonds}% Bonds / {RISK_PROFILES[inv.riskProfile].cash}% Cash / {RISK_PROFILES[inv.riskProfile].crypto}% Crypto
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2 mb-1">
            <button
              className={`text-xs px-2 py-0.5 rounded ${phase === 'pre' ? 'bg-gray-200 dark:bg-gray-700 font-medium' : ''}`}
              onClick={() => setPhase('pre')}
            >
              Pre-Retirement
            </button>
            <button
              className={`text-xs px-2 py-0.5 rounded ${phase === 'post' ? 'bg-gray-200 dark:bg-gray-700 font-medium' : ''}`}
              onClick={() => setPhase('post')}
            >
              Post-Retirement
            </button>
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
                            min={0}
                            max={100}
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

          {/* Asset class return assumptions */}
          <details className="text-xs">
            <summary className="cursor-pointer text-primary-600 dark:text-primary-400">
              Return Assumptions
            </summary>
            <div className="mt-1 space-y-1">
              {ASSET_CLASSES.map(ac => {
                const ret = inv.assetClassReturns[ac] ?? DEFAULT_ASSET_RETURNS[ac];
                return (
                <div key={ac} className="flex items-center gap-2">
                  <span className="w-16 truncate">{ASSET_CLASS_LABELS[ac]}</span>
                  <div>
                    <label className="input-label">Mean %</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input-field w-14 text-right"
                      value={(ret.mean * 100).toFixed(1)}
                      onChange={e =>
                        setField(`investments.assetClassReturns.${ac}.mean`, (parseFloat(e.target.value) || 0) / 100)
                      }
                    />
                  </div>
                  <div>
                    <label className="input-label">Vol %</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input-field w-14 text-right"
                      value={(ret.stdDev * 100).toFixed(1)}
                      onChange={e =>
                        setField(`investments.assetClassReturns.${ac}.stdDev`, (parseFloat(e.target.value) || 0) / 100)
                      }
                    />
                  </div>
                </div>
              );
              })}
              <div className="flex items-center gap-2 mt-1">
                <label className="input-label mb-0">Tail Risk:</label>
                <input
                  type="number"
                  className="input-field w-14"
                  min={3}
                  max={30}
                  value={inv.fatTailDf}
                  onChange={e => setField('investments.fatTailDf', parseInt(e.target.value) || 6)}
                />
                <span className="text-[10px] text-gray-400">
                  {inv.fatTailDf <= 5 ? 'Extreme' : inv.fatTailDf <= 9 ? 'High' : inv.fatTailDf <= 15 ? 'Moderate' : 'Low'}
                </span>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
