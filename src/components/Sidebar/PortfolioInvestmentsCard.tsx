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
import { Toggle, Section } from './shared';
import { InfoTip } from './InfoTip';
import { ACCOUNT_DESCRIPTIONS } from '../../constants/descriptions';

// ── Bear market frequency scale: 1–10 (0.5 steps) → bear-year probability ──
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

function bearFreqColor(cf: number): string {
  const t = (cf - 1) / 9;
  if (t <= 0.5) {
    const u = t / 0.5;
    const r = Math.round(59 + (245 - 59) * u);
    const g = Math.round(130 + (158 - 130) * u);
    const b = Math.round(246 + (11 - 246) * u);
    return `rgb(${r},${g},${b})`;
  } else {
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

  const preAlloc = inv.preRetirement[ACCOUNT_TYPES[0]];
  const postAlloc = inv.postRetirement[ACCOUNT_TYPES[0]];
  const preSum = ASSET_CLASSES.reduce((s, ac) => s + preAlloc[ac], 0);
  const postSum = ASSET_CLASSES.reduce((s, ac) => s + postAlloc[ac], 0);
  const showPerAccount = inv.mode === 'advanced';
  const isEditable = customizeDefaults && !showPerAccount;

  return (
    <div className="space-y-8">
      {/* ── Account Balances ── */}
      <Section
        title="Account Balances"
      >
        <div className="space-y-2">
          {visibleAccounts.map(acct => (
            <div key={acct} className="flex items-center gap-2 py-1">
              <span className="text-sm w-44 shrink-0 text-gray-700 dark:text-gray-200" title={ACCOUNT_LABELS[acct]}>
                {ACCOUNT_LABELS[acct]}
                <InfoTip text={ACCOUNT_DESCRIPTIONS[acct]} />
              </span>
              <span className="text-sm text-gray-400">$</span>
              <CurrencyInput
                className="w-36"
                value={scenario.balances[acct]}
                onChange={v => setField(`balances.${acct}`, v)}
              />
              <button
                type="button"
                className="text-gray-400 hover:text-red-500 text-sm px-1"
                onClick={() => removeAccount(acct)}
                title={`Remove ${ACCOUNT_LABELS[acct]}`}
              >✕</button>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Portfolio</span>
          <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
            ${totalBalance.toLocaleString()}
          </span>
        </div>

        {hiddenAccounts.length > 0 && (
          <select
            className="input-field text-sm w-56 mt-3"
            value=""
            onChange={e => { if (e.target.value) addAccount(e.target.value as AccountType); }}
          >
            <option value="">+ Add account type…</option>
            {hiddenAccounts.map(acct => (
              <option key={acct} value={acct}>{ACCOUNT_LABELS[acct]}</option>
            ))}
          </select>
        )}

        {visibleAccounts.includes('taxable') && (
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 max-w-sm">
            <label className="input-label">Original Investment %
              <InfoTip text="The percentage of your taxable brokerage account that represents money you originally invested (your 'cost basis'), versus gains from growth. This affects how much tax you pay when selling." />
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              How much of your brokerage account is money you put in (vs. growth)
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-48"
                min={0} max={100} step={5}
                value={Math.round(scenario.taxableCostBasisPct * 100)}
                onChange={e => setField('taxableCostBasisPct', parseInt(e.target.value) / 100)}
              />
              <span className="text-sm font-semibold text-primary-600 dark:text-primary-400 w-10 text-right">
                {Math.round(scenario.taxableCostBasisPct * 100)}%
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* ── Allocations ── */}
      <Section
        title="Allocations"
        description="How your portfolio is split between stocks, bonds, cash, and crypto."
      >
        {/* Risk profile selector */}
        <div className="space-y-4">
          <div>
            <label className="input-label">Risk Profile</label>
            <div className="flex gap-2 max-w-md">
              {(['conservative', 'balanced', 'aggressive'] as RiskProfile[]).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`flex-1 text-sm py-2 rounded border transition-colors ${
                    inv.riskProfile === p && !customizeDefaults && !showPerAccount
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                  onClick={() => handleRiskProfile(p)}
                >
                  {RISK_PROFILE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Default allocation display — Pre & Post */}
          {!showPerAccount && (
            <div className="max-w-md">
              {/* Asset class column headers */}
              <div className="grid grid-cols-[100px_repeat(4,1fr)] gap-2 mb-1">
                <span />
                {ASSET_CLASSES.map(ac => (
                  <span key={ac} className="text-xs text-center text-gray-500 dark:text-gray-400">
                    {ASSET_CLASS_LABELS[ac]}
                  </span>
                ))}
              </div>

              {/* Pre-Retirement row */}
              {!isRetired && (
                <div className="grid grid-cols-[100px_repeat(4,1fr)] gap-2 items-center py-1.5">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Pre-Retirement</span>
                  {ASSET_CLASSES.map(ac => (
                    <div key={ac} className="text-center">
                      {isEditable ? (
                        <div className="flex items-center justify-center gap-0.5">
                          <input
                            type="number"
                            className={`input-field w-14 text-center text-sm py-1 px-1 ${preSum !== 100 ? 'border-red-300 dark:border-red-700' : ''}`}
                            min={0} max={100}
                            value={preAlloc[ac]}
                            onChange={e => {
                              const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                              ACCOUNT_TYPES.forEach(acct => {
                                setField(`investments.preRetirement.${acct}.${ac}`, val);
                              });
                            }}
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{preAlloc[ac]}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Post-Retirement row */}
              <div className="grid grid-cols-[100px_repeat(4,1fr)] gap-2 items-center py-1.5">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {isRetired ? 'Allocation' : 'Post-Retirement'}
                </span>
                {ASSET_CLASSES.map(ac => (
                  <div key={ac} className="text-center">
                    {isEditable ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <input
                          type="number"
                          className={`input-field w-14 text-center text-sm py-1 px-1 ${postSum !== 100 ? 'border-red-300 dark:border-red-700' : ''}`}
                          min={0} max={100}
                          value={postAlloc[ac]}
                          onChange={e => {
                            const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                            ACCOUNT_TYPES.forEach(acct => {
                              setField(`investments.postRetirement.${acct}.${ac}`, val);
                            });
                          }}
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{postAlloc[ac]}%</span>
                    )}
                  </div>
                ))}
              </div>

              {isEditable && (preSum !== 100 || postSum !== 100) && (
                <p className="text-xs text-red-500 mt-1">Each row must add up to 100%.</p>
              )}

              {!isEditable && (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                  onClick={() => setCustomizeDefaults(true)}
                >
                  Customize
                </button>
              )}
            </div>
          )}

          {/* Customize per account toggle */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
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
                fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
              Customize per account
            </button>
          </div>

          {showPerAccount && (
            <div className="max-w-lg">
              {!isRetired && (
                <div className="flex gap-1 mb-3 max-w-xs">
                  {(['pre', 'post'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                        phase === p
                          ? 'bg-gray-200 dark:bg-gray-700 font-medium text-gray-900 dark:text-gray-100'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => setPhase(p)}
                    >
                      {p === 'pre' ? 'Pre-Retirement' : 'Post-Retirement'}
                    </button>
                  ))}
                </div>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-1.5 text-xs font-medium text-gray-500 w-36">Account</th>
                    {ASSET_CLASSES.map(ac => (
                      <th key={ac} className="text-center py-1.5 text-xs font-medium text-gray-500 px-2">{ASSET_CLASS_LABELS[ac]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map(acct => {
                    const alloc = currentAllocations[acct];
                    const sum = ASSET_CLASSES.reduce((s, ac) => s + alloc[ac], 0);
                    return (
                      <tr key={acct} className={`${sum !== 100 ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                        <td className="py-1.5 text-sm text-gray-700 dark:text-gray-300 truncate max-w-[140px]" title={ACCOUNT_LABELS[acct]}>
                          {ACCOUNT_LABELS[acct]}
                        </td>
                        {ASSET_CLASSES.map(ac => (
                          <td key={ac} className="px-1 text-center py-1">
                            <input
                              type="number"
                              className="input-field w-14 text-center text-sm py-1 px-1"
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
              {ve.filter(e => e.field.startsWith(phase === 'pre' ? 'investments.preRetirement' : 'investments.postRetirement')).map((err, i) => (
                <p key={i} className="text-xs text-red-500 mt-1">{err.message}</p>
              ))}
            </div>
          )}

          {/* Early withdrawal penalty toggle */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
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
      </Section>

      {/* ── Rate Assumptions ── */}
      <Section
        title="Rate Assumptions"
        description="Expected nominal returns by asset class and bear market frequency."
        collapsible
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Market Outlook selector */}
          <div>
            <label className="input-label">Market Outlook</label>
            <div className="flex gap-2 max-w-md">
              {(['conservative', 'moderate', 'optimistic'] as ReturnOutlook[]).map(o => (
                <button
                  key={o}
                  type="button"
                  className={`flex-1 text-sm py-2 rounded border transition-colors ${
                    inv.returnOutlook === o && !customizeReturns
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300 font-medium'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                  onClick={() => handleReturnOutlook(o)}
                >
                  {RETURN_OUTLOOK_LABELS[o]}
                </button>
              ))}
            </div>
          </div>

          {/* Default return summary */}
          {!customizeReturns && (
            <div className="max-w-sm space-y-2">
              <div className="grid grid-cols-4 gap-3">
                {ASSET_CLASSES.map(ac => (
                  <div key={ac} className="text-center">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{ASSET_CLASS_LABELS[ac]}</span>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {((inv.assetClassReturns[ac]?.mean ?? 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Bear frequency:{' '}
                <span className="font-medium" style={{ color: bearFreqColor(inv.crashFrequency) }}>
                  {bearFreqLabel(inv.crashFrequency)} (~{bearFreqPct(inv.crashFrequency)}% bear years)
                </span>
              </p>
              <button
                type="button"
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                onClick={() => setCustomizeReturns(true)}
              >
                Customize
              </button>
            </div>
          )}

          {/* Customizable per-asset return inputs */}
          {customizeReturns && (
            <div className="max-w-sm space-y-3">
              <div className="space-y-1.5">
                <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
                  <span className="text-xs font-medium text-gray-500" />
                  <span className="text-xs text-gray-500 text-center">Avg Return %</span>
                </div>
                {ASSET_CLASSES.map(ac => {
                  const ret = inv.assetClassReturns[ac];
                  return (
                    <div key={ac} className="grid grid-cols-[80px_1fr] gap-2 items-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{ASSET_CLASS_LABELS[ac]}</span>
                      <PercentInput
                        className="input-field w-20 text-center text-sm"
                        value={ret?.mean ?? 0}
                        onChange={v => setField(`investments.assetClassReturns.${ac}.mean`, v)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Bear market frequency slider */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                <label className="input-label mb-2">Bear Market Frequency</label>
                <div className="flex justify-between px-0.5 mb-1">
                  <span className="text-xs text-blue-400">Infrequent</span>
                  <span className="text-xs text-amber-400">Average</span>
                  <span className="text-xs text-red-400">Frequent</span>
                </div>
                <input
                  type="range"
                  className={`bear-freq-slider w-full ${fieldErrorClass(ve, 'investments.crashFrequency')}`}
                  min={1} max={10} step={0.5}
                  value={inv.crashFrequency}
                  onChange={e => setField('investments.crashFrequency', parseFloat(e.target.value))}
                  style={{ '--thumb-color': bearFreqColor(inv.crashFrequency) } as React.CSSProperties}
                />
                <div className="flex justify-between items-center mt-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: bearFreqColor(inv.crashFrequency) }}
                  >
                    ~{bearFreqPct(inv.crashFrequency)}% bear years · {bearFreqLabel(inv.crashFrequency)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  How often bear markets occur. 'Historical' matches the last ~100 years of data.
                </p>
              </div>
            </div>
          )}
          <FieldError errors={ve} field="investments.crashFrequency" />
        </div>
      </Section>
    </div>
  );
}
