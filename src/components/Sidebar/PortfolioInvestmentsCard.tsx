import React, { useState } from 'react';
import { useScenario } from '../../context/ScenarioContext';
import {
  ACCOUNT_TYPES, ACCOUNT_LABELS, ASSET_CLASSES, ASSET_CLASS_LABELS,
  type AssetAllocation, type AccountType, type RiskProfile, type ReturnOutlook,
} from '../../types';
import {
  RISK_PROFILES, RISK_PROFILE_LABELS, makeUniformAllocations,
  RETURN_OUTLOOK_PRESETS, RETURN_OUTLOOK_LABELS, DEFAULT_VOLATILITY,
} from '../../constants/asset-classes';
import { CurrencyInput } from './CurrencyInput';
import { PercentInput } from './PercentInput';
import { FieldError, fieldErrorClass, type CardProps } from './FieldError';
import { Toggle } from './shared';
import { InfoTip } from './InfoTip';
import { ACCOUNT_DESCRIPTIONS } from '../../constants/descriptions';

// ── Bear market frequency scale: 1–10 (0.5 steps) → bear-year probability ──
// Slider value is stored directly as crashFrequency (1-10).
// 1 → 5% bear years, 5.5 → 18% (historical), 10 → 30%
function bearFreqLabel(cf: number): string {
  if (cf <= 2) return 'Calm';
  if (cf <= 4) return 'Mild';
  if (cf <= 6.5) return 'Historical';
  if (cf <= 8.5) return 'Stormy';
  return 'Very Stormy';
}

function bearFreqPct(cf: number): number {
  return Math.round((0.05 + (cf - 1) * (0.25 / 9)) * 100);
}

/** Interpolate the gradient color for a slider position (1–10) */
function bearFreqColor(cf: number): string {
  // 1=calm blue, 5.5=amber, 10=red
  const t = (cf - 1) / 9; // 0–1
  if (t <= 0.5) {
    // blue (#3b82f6) → amber (#f59e0b)
    const u = t / 0.5;
    const r = Math.round(59 + (245 - 59) * u);
    const g = Math.round(130 + (158 - 130) * u);
    const b = Math.round(246 + (11 - 246) * u);
    return `rgb(${r},${g},${b})`;
  } else {
    // amber (#f59e0b) → red (#ef4444)
    const u = (t - 0.5) / 0.5;
    const r = Math.round(245 + (239 - 245) * u);
    const g = Math.round(158 + (68 - 158) * u);
    const b = Math.round(11 + (68 - 11) * u);
    return `rgb(${r},${g},${b})`;
  }
}

export function PortfolioInvestmentsCard({ validationErrors }: CardProps) {
  const { scenario, setField } = useScenario();
  const ve = validationErrors;
  const inv = scenario.investments;
  const [phase, setPhase] = useState<'pre' | 'post'>(scenario.currentAge >= scenario.retirementAge ? 'post' : 'pre');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['balances']));
  const [customizeDefaults, setCustomizeDefaults] = useState(false);
  const [customizeReturns, setCustomizeReturns] = useState(false);
  const isRetired = scenario.currentAge >= scenario.retirementAge;

  const totalBalance = ACCOUNT_TYPES.reduce((s, a) => s + scenario.balances[a], 0);

  const visibleAccounts = scenario.visibleAccounts ?? ['traditional401k', 'cashAccount'];
  const hiddenAccounts = ACCOUNT_TYPES.filter(a => !visibleAccounts.includes(a));

  const addAccount = (acct: AccountType) => {
    setField('visibleAccounts', [...visibleAccounts, acct]);
  };

  const removeAccount = (acct: AccountType) => {
    const balance = scenario.balances[acct] || 0;
    const alloc = scenario.contributionAllocation[acct] || 0;
    if (balance > 0 || alloc > 0) {
      if (!window.confirm(`${ACCOUNT_LABELS[acct]} has a balance of $${balance.toLocaleString()} and ${alloc}% allocation. Removing it will zero out both. Continue?`)) {
        return;
      }
      setField(`balances.${acct}`, 0);
      setField(`contributionAllocation.${acct}`, 0);
    }
    setField('visibleAccounts', visibleAccounts.filter(a => a !== acct));
  };

  const handleRiskProfile = (profile: RiskProfile) => {
    setField('investments.riskProfile', profile);
    setField('investments.mode', 'simple');
    setField('investments.preRetirement', makeUniformAllocations(RISK_PROFILES[profile]));
    const postMap: Record<RiskProfile, RiskProfile> = {
      aggressive: 'balanced',
      balanced: 'conservative',
      conservative: 'conservative',
    };
    setField('investments.postRetirement', makeUniformAllocations(RISK_PROFILES[postMap[profile]]));
    setCustomizeDefaults(false);
  };

  const handleReturnOutlook = (outlook: ReturnOutlook) => {
    const preset = RETURN_OUTLOOK_PRESETS[outlook];
    setField('investments.returnOutlook', outlook);
    for (const ac of ASSET_CLASSES) {
      setField(`investments.assetClassReturns.${ac}`, {
        mean: preset.means[ac],
        stdDev: DEFAULT_VOLATILITY[ac],
      });
    }
    setField('investments.crashFrequency', preset.crashFrequency);
    setCustomizeReturns(false);
  };

  const currentAllocations = phase === 'pre' ? inv.preRetirement : inv.postRetirement;
  const allocField = phase === 'pre' ? 'investments.preRetirement' : 'investments.postRetirement';

  const setAccountAlloc = (acct: AccountType, ac: string, val: number) => {
    const current = { ...currentAllocations[acct] };
    current[ac as keyof AssetAllocation] = val;
    setField(`${allocField}.${acct}`, current);
  };

  const sectionBtn = (id: 'balances' | 'allocations' | 'returns', label: string) => {
    const isOpen = openSections.has(id);
    return (
      <button
        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-md border transition-colors ${
          isOpen
            ? 'bg-primary-50 dark:bg-primary-900/50 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 font-medium'
            : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60'
        }`}
        onClick={() => {
          const next = new Set(openSections);
          if (next.has(id)) next.delete(id); else next.add(id);
          setOpenSections(next);
        }}
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
      {openSections.has('balances') && (
        <div className="px-1 pb-2 space-y-2">
          <div className="space-y-1">
            {visibleAccounts.map(acct => (
              <div key={acct} className="flex items-center gap-2">
                <span className="text-[11px] w-28 truncate text-gray-600 dark:text-gray-400" title={ACCOUNT_LABELS[acct]}>
                  {ACCOUNT_LABELS[acct]}
                  <InfoTip text={ACCOUNT_DESCRIPTIONS[acct]} />
                </span>
                <span className="text-[11px] text-gray-400">$</span>
                <CurrencyInput
                  className="flex-1"
                  value={scenario.balances[acct]}
                  onChange={v => setField(`balances.${acct}`, v)}
                />
                <button
                  className="text-red-400 hover:text-red-600 text-xs px-0.5"
                  onClick={() => removeAccount(acct)}
                  title={`Remove ${ACCOUNT_LABELS[acct]}`}
                >✕</button>
              </div>
            ))}
          </div>
          {hiddenAccounts.length > 0 && (
            <select
              className="input-field text-[11px] py-1"
              value=""
              onChange={e => { if (e.target.value) addAccount(e.target.value as AccountType); }}
            >
              <option value="">+ Add account type...</option>
              {hiddenAccounts.map(acct => (
                <option key={acct} value={acct}>{ACCOUNT_LABELS[acct]}</option>
              ))}
            </select>
          )}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500">Total Portfolio</span>
            <span className="font-semibold text-primary-600 dark:text-primary-400">
              ${totalBalance.toLocaleString()}
            </span>
          </div>
          {visibleAccounts.includes('taxable') && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
            <div className="flex-1">
              <label className="input-label">Original Investment %
                <InfoTip text="The percentage of your taxable brokerage account that represents money you originally invested (your 'cost basis'), versus gains from growth. This affects how much tax you pay when selling." />
              </label>
              <p className="text-[10px] text-gray-400">How much of your brokerage account is money you put in (vs. growth)</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="range"
                className="w-20"
                min={0} max={100} step={5}
                value={Math.round(scenario.taxableCostBasisPct * 100)}
                onChange={e => setField('taxableCostBasisPct', parseInt(e.target.value) / 100)}
              />
              <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 w-8 text-right">
                {Math.round(scenario.taxableCostBasisPct * 100)}%
              </span>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ── Allocations ── */}
      {sectionBtn('allocations', 'Allocations')}
      {openSections.has('allocations') && (() => {
        const preAlloc = inv.preRetirement[ACCOUNT_TYPES[0]];
        const postAlloc = inv.postRetirement[ACCOUNT_TYPES[0]];
        const preSum = ASSET_CLASSES.reduce((s, ac) => s + preAlloc[ac], 0);
        const postSum = ASSET_CLASSES.reduce((s, ac) => s + postAlloc[ac], 0);
        const showPerAccount = inv.mode === 'advanced';
        const showDefaultBoxes = !showPerAccount;
        const isEditable = customizeDefaults && !showPerAccount;

        const allocRow = (label: string, alloc: Record<string, number>, sum: number, phaseKey: 'preRetirement' | 'postRetirement') => (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
              {isEditable && sum !== 100 && (
                <span className="text-[10px] font-medium text-red-500">
                  {sum}% — must equal 100%
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {ASSET_CLASSES.map(ac => (
                <div key={ac} className="text-center">
                  {isEditable ? (
                    <div className="flex items-center justify-center gap-0.5">
                      <input
                        type="number"
                        className={`input-field w-12 text-center text-[11px] py-0.5 px-1 ${sum !== 100 ? 'border-red-300 dark:border-red-700' : ''}`}
                        min={0} max={100}
                        value={alloc[ac]}
                        onChange={e => {
                          const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          ACCOUNT_TYPES.forEach(acct => {
                            setField(`investments.${phaseKey}.${acct}.${ac}`, val);
                          });
                        }}
                      />
                      <span className="text-[10px] text-gray-400">%</span>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {alloc[ac]}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

        return (
          <div className="px-1 pb-2 space-y-3">
            {/* Risk profile selector */}
            <div className="space-y-2">
              <label className="input-label">Risk Profile</label>
              <div className="flex gap-1">
                {(['conservative', 'balanced', 'aggressive'] as RiskProfile[]).map(p => (
                  <button
                    key={p}
                    className={`flex-1 text-xs py-1.5 rounded border ${
                      inv.riskProfile === p && !customizeDefaults && !showPerAccount
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    onClick={() => handleRiskProfile(p)}
                  >
                    {RISK_PROFILE_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Default allocation display — Pre & Post */}
            {showDefaultBoxes && (
              <div className="space-y-3">
                {/* Column headers */}
                <div className="grid grid-cols-4 gap-1.5 pl-0">
                  {ASSET_CLASSES.map(ac => (
                    <div key={ac} className="text-center">
                      <label className="text-[10px] text-gray-500">{ASSET_CLASS_LABELS[ac]}</label>
                    </div>
                  ))}
                </div>
                {!isRetired && allocRow('Pre-Retirement', preAlloc, preSum, 'preRetirement')}
                {allocRow(isRetired ? 'Allocation' : 'Post-Retirement', postAlloc, postSum, 'postRetirement')}
                {!isEditable && (
                  <button
                    className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline"
                    onClick={() => setCustomizeDefaults(true)}
                  >
                    Customize
                  </button>
                )}
              </div>
            )}

            {/* Customize per account toggle */}
            <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
              <button
                className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                onClick={() => {
                  if (showPerAccount) {
                    setField('investments.mode', 'simple');
                  } else {
                    setField('investments.mode', 'advanced');
                    setCustomizeDefaults(false);
                  }
                }}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${showPerAccount ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
                <span>Customize per account</span>
              </button>
            </div>

            {showPerAccount && (
              <div className="space-y-2">
                {!isRetired && (
                  <div className="flex gap-1">
                    {(['pre', 'post'] as const).map(p => (
                      <button
                        key={p}
                        className={`flex-1 text-[11px] py-1 rounded ${phase === p ? 'bg-gray-200 dark:bg-gray-700 font-medium' : 'text-gray-500'}`}
                        onClick={() => setPhase(p)}
                      >
                        {p === 'pre' ? 'Pre-Retirement' : 'Post-Retirement'}
                      </button>
                    ))}
                  </div>
                )}

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
                      {visibleAccounts.map(acct => {
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
                {ve.filter(e => e.field.startsWith(phase === 'pre' ? 'investments.preRetirement' : 'investments.postRetirement')).map((err, i) => (
                  <p key={i} className="text-[10px] text-red-500 mt-1">{err.message}</p>
                ))}
              </div>
            )}
            {/* Rule of 55 / Early withdrawal penalty toggle */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-1">
                <Toggle
                  checked={!scenario.ruleof55Eligible}
                  onChange={v => setField('ruleof55Eligible', !v)}
                  label="10% Early Withdrawal Penalty"
                />
                <InfoTip text="When enabled, withdrawals from 401(k) and Roth 401(k) accounts before age 59½ incur a 10% IRS penalty. Disable this if you qualify for the Rule of 55 — which allows penalty-free 401(k) withdrawals if you separate from your employer at age 55 or later." />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Rate Assumptions ── */}
      {sectionBtn('returns', 'Rate Assumptions')}
      {openSections.has('returns') && (
        <div className="px-1 pb-2 space-y-2">
          <p className="text-[10px] text-gray-400">
            Expected nominal returns by asset class and bear market frequency.
            <InfoTip text="'Nominal' means before subtracting inflation. The simulation handles inflation separately. Conservative reflects current professional forecasts (6-7% stocks). Moderate blends near-term forecasts with long-term historical averages. Optimistic uses full historical averages (~10% stocks)." />
          </p>

          {/* Return outlook preset selector */}
          <div className="space-y-2">
            <label className="input-label">Market Outlook</label>
            <div className="flex gap-1">
              {(['conservative', 'moderate', 'optimistic'] as ReturnOutlook[]).map(o => (
                <button
                  key={o}
                  className={`flex-1 text-xs py-1.5 rounded border ${
                    inv.returnOutlook === o && !customizeReturns
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={() => handleReturnOutlook(o)}
                >
                  {RETURN_OUTLOOK_LABELS[o]}
                </button>
              ))}
            </div>
          </div>

          {/* Default return display (read-only summary) */}
          {!customizeReturns && (
            <div className="space-y-1">
              <div className="grid grid-cols-4 gap-1.5">
                {ASSET_CLASSES.map(ac => (
                  <div key={ac} className="text-center">
                    <label className="text-[10px] text-gray-500">{ASSET_CLASS_LABELS[ac]}</label>
                    <div className="text-[11px] font-medium">
                      {((inv.assetClassReturns[ac]?.mean ?? 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-gray-400">
                Bear frequency: <span className="font-medium" style={{ color: bearFreqColor(inv.crashFrequency) }}>
                  {bearFreqLabel(inv.crashFrequency)} (~{bearFreqPct(inv.crashFrequency)}% bear years)
                </span>
              </div>
              <button
                className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline"
                onClick={() => setCustomizeReturns(true)}
              >
                Customize
              </button>
            </div>
          )}

          {/* Customizable per-asset return inputs */}
          {customizeReturns && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[11px] w-14"></span>
                <span className="text-[10px] text-gray-400 w-20 text-center">Avg Return %</span>
              </div>
              {ASSET_CLASSES.map(ac => {
                const ret = inv.assetClassReturns[ac];
                return (
                  <div key={ac} className="flex items-center gap-1">
                    <span className="text-[11px] w-14 truncate">{ASSET_CLASS_LABELS[ac]}</span>
                    <PercentInput
                      className="input-field w-20 text-center text-[11px]"
                      value={ret?.mean ?? 0}
                      onChange={v => setField(`investments.assetClassReturns.${ac}.mean`, v)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Bear market frequency (always visible when customizing) */}
          {customizeReturns && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <label className="input-label mb-1">Bear Market Frequency</label>
              <div className="flex justify-between px-1 mb-1">
                <span className="text-[10px] text-blue-400">Infrequent</span>
                <span className="text-[10px] text-amber-400">Average</span>
                <span className="text-[10px] text-red-400">Frequent</span>
              </div>
              <input
                type="range"
                className={`bear-freq-slider w-full ${fieldErrorClass(ve, 'investments.crashFrequency')}`}
                min={1} max={10} step={0.5}
                value={inv.crashFrequency}
                onChange={e => setField('investments.crashFrequency', parseFloat(e.target.value))}
                style={{ '--thumb-color': bearFreqColor(inv.crashFrequency) } as React.CSSProperties}
              />
              <div className="flex justify-between items-center mt-1 px-1">
                <span
                  className="text-[11px] font-medium"
                  style={{ color: bearFreqColor(inv.crashFrequency) }}
                >
                  ~{bearFreqPct(inv.crashFrequency)}% bear years · {bearFreqLabel(inv.crashFrequency)}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                How often bear markets occur. &lsquo;Historical&rsquo; matches the last ~100 years of data.
              </p>
            </div>
          )}
          <FieldError errors={ve} field="investments.crashFrequency" />
        </div>
      )}
    </div>
  );
}
