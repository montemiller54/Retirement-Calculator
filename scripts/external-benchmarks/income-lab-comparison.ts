/**
 * Income Lab head-to-head comparison.
 *
 * Income Lab publishes fully-specified worked examples (with outputs) in
 * "Retirement Income Guardrails: The Complete Guide" (incomelaboratory.com,
 * 2026). This harness rebuilds those households in our engine and compares:
 *
 *   1. Safe spending at 80% success  vs  their "retirement paycheck"
 *      (their default 20/80 risk posture = spending at the 20th percentile,
 *      i.e. 80% of scenarios support more).
 *   2. Our success rate at their published paycheck (≈80% by construction
 *      if the engines agree).
 *   3. Guardrail balances: holding spending at their paycheck, solve for the
 *      starting portfolio balance where success = 25% (their lower guardrail,
 *      "75% overspending risk") and success = 99% (their upper guardrail,
 *      "100% underspending risk", 99% used as MC-practical proxy).
 *
 * Known methodology differences (expect directional, not exact, agreement):
 *   - Income Lab uses mortality-weighted horizons; we use a fixed end age
 *     (chosen per scenario to approximate ~30% joint/single longevity risk).
 *   - Their default engine replays historical return/inflation sequences;
 *     ours is regime-switching Monte Carlo.
 *   - They don't publish asset allocation, state, pension COLA, or the
 *     trad/taxable split; assumptions are documented per scenario below.
 *
 * The fourth published example (Mark & Linda, 67/65, $1.6M) is omitted:
 *   their SS and pension amounts are not published, so it can't be rebuilt.
 *
 * Usage: npx tsx scripts/external-benchmarks/income-lab-comparison.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSimulation, findSafeSpending } from '../../src/engine/simulation';
import { DEFAULT_SCENARIO } from '../../src/constants/defaults';
import {
  makeUniformAllocations,
  DEFAULT_ASSET_RETURNS,
  DEFAULT_CRASH_FREQUENCY,
} from '../../src/constants/asset-classes';
import type { ScenarioInput, AssetAllocation, AccountBalances } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'benchmarks');

// Annual advisory-fee drag (e.g. FEE_DRAG=0.009), subtracted from every
// asset-class mean return to approximate the AUM fee Income Lab's
// advisor-facing examples implicitly include.
const FEE_DRAG = Number(process.env.FEE_DRAG ?? 0);
const OUT_FILE = join(OUT_DIR, FEE_DRAG > 0 ? 'income-lab-comparison-with-fees.md' : 'income-lab-comparison.md');

const SEED = 12345;
const SIMS = 4000;
const GUARDRAIL_SEARCH_SIMS = 2000;
const GUARDRAIL_SEARCH_ITERS = 16;

// Income Lab's default risk posture: 20% overspending risk = 80% success
const PAYCHECK_TARGET_SUCCESS = 0.80;
// Lower guardrail: 75% overspending risk = 25% success
const LOWER_GUARDRAIL_SUCCESS = 0.25;
// Upper guardrail: 100% underspending risk; 99% is a practical MC proxy
const UPPER_GUARDRAIL_SUCCESS = 0.99;

function alloc(stocks: number, bonds: number): AssetAllocation {
  return { stocks, bonds, cash: 0, crypto: 0 };
}

function zeroBalances(): AccountBalances {
  return {
    traditional401k: 0, roth401k: 0,
    traditionalIRA: 0, rothIRA: 0,
    taxable: 0, hsa: 0,
    cashAccount: 0, otherAssets: 0,
  };
}

// Shared base: retired household, manual SS, no jobs/contributions, no
// separate healthcare line (Income Lab's examples fold everything into the
// paycheck), guardrails off (we solve for fixed-spending sustainability),
// 60/40 allocation, TX = state-neutral (no state income tax).
function baseScenario(overrides: Partial<ScenarioInput>): ScenarioInput {
  return {
    ...DEFAULT_SCENARIO,
    stateCode: 'TX',
    jobs: [],
    totalSavingsRate: 0,
    socialSecurityMode: 'manual',
    socialSecurityCOLA: 0.025,
    otherIncomeSources: [],
    oneTimeExpenses: [],
    spendingInflationRate: 0.025,
    guardrails: { ...DEFAULT_SCENARIO.guardrails, enabled: false },
    healthcare: { ...DEFAULT_SCENARIO.healthcare, enabled: false },
    rothConversion: { ...DEFAULT_SCENARIO.rothConversion, enabled: false },
    housing: { ...DEFAULT_SCENARIO.housing, enabled: false },
    investments: {
      mode: 'simple',
      riskProfile: 'balanced',
      returnOutlook: 'moderate',
      preRetirement: makeUniformAllocations(alloc(60, 40)),
      postRetirement: makeUniformAllocations(alloc(60, 40)),
      assetClassReturns: Object.fromEntries(
        Object.entries(DEFAULT_ASSET_RETURNS).map(
          ([k, v]) => [k, { ...v, mean: v.mean - FEE_DRAG }],
        ),
      ) as ScenarioInput['investments']['assetClassReturns'],
      crashFrequency: DEFAULT_CRASH_FREQUENCY,
    },
    ...overrides,
  };
}

interface ILReference {
  paycheckMonthly: number;
  lowerGuardrailBalance?: number;
  upperGuardrailBalance?: number;
  /** extra published success-rate claims to check, at a given spending */
  successChecks?: { label: string; monthlySpending: number; ilClaim?: string }[];
}

interface ILCase {
  id: string;
  description: string;
  assumptions: string[];
  scenario: ScenarioInput;
  il: ILReference;
}

const CASES: ILCase[] = [
  {
    id: 'sarah-tom',
    description: 'Sarah & Tom — both 62, just retired, $1.8M (trad IRA + taxable), SS $2,800 + $2,200/mo at 67',
    assumptions: [
      'Trad IRA / taxable split not published → assumed $900K / $900K, 80% cost basis',
      'Allocation not published → 60/40; state-neutral (TX)',
      'Horizon: fixed end age 97 (≈30% joint longevity risk for a 62yo couple)',
    ],
    scenario: baseScenario({
      currentAge: 62,
      retirementAge: 62,
      endAge: 97,
      filingStatus: 'mfj',
      balances: { ...zeroBalances(), traditionalIRA: 900_000, taxable: 900_000 },
      taxableCostBasisPct: 0.80,
      baseMonthlySpending: 9_200, // overwritten per test
      socialSecurityBenefit: 2_800,
      socialSecurityClaimAge: 67,
      pensionAmount: 0,
      spouse: {
        enabled: true,
        currentAge: 62,
        retirementAge: 62,
        socialSecurityBenefit: 2_200,
        socialSecurityClaimAge: 67,
      },
    }),
    il: {
      paycheckMonthly: 9_200,
      upperGuardrailBalance: 2_150_000,
      lowerGuardrailBalance: 1_450_000,
      successChecks: [
        { label: 'At their $10,000/mo combined target', monthlySpending: 10_000, ilClaim: '“roughly 80%”' },
      ],
    },
  },
  {
    id: 'margaret',
    description: 'Margaret — widow 71, $1.2M trad IRA + $200K Roth, SS $3,100/mo (collecting)',
    assumptions: [
      'Allocation not published → 60/40; state-neutral (TX)',
      'Horizon: fixed end age 94 (≈30% longevity risk for a 71yo female)',
      'SS claim age set to 71 (already collecting; benefit in today\'s dollars)',
    ],
    scenario: baseScenario({
      currentAge: 71,
      retirementAge: 71,
      endAge: 94,
      filingStatus: 'single',
      balances: { ...zeroBalances(), traditionalIRA: 1_200_000, rothIRA: 200_000 },
      baseMonthlySpending: 7_100,
      socialSecurityBenefit: 3_100,
      socialSecurityClaimAge: 71,
      pensionAmount: 0,
      spouse: { ...DEFAULT_SCENARIO.spouse, enabled: false },
    }),
    il: {
      paycheckMonthly: 7_100,
      lowerGuardrailBalance: 1_050_000,
      successChecks: [
        { label: 'At her $6,800/mo essential need', monthlySpending: 6_800 },
      ],
    },
  },
  {
    id: 'robert-linda',
    description: 'Robert & Linda — both 68, $2.5M (tax-deferred + taxable), pension $1,500/mo, SS $3,200 + $1,800/mo (collecting)',
    assumptions: [
      'Tax-deferred / taxable split not published → assumed $1.25M / $1.25M, 80% cost basis',
      'Pension COLA not published → 0%; allocation → 60/40; state-neutral (TX)',
      'Horizon: fixed end age 96 (≈30% joint longevity risk for a 68yo couple)',
    ],
    scenario: baseScenario({
      currentAge: 68,
      retirementAge: 68,
      endAge: 96,
      filingStatus: 'mfj',
      balances: { ...zeroBalances(), traditionalIRA: 1_250_000, taxable: 1_250_000 },
      taxableCostBasisPct: 0.80,
      baseMonthlySpending: 11_400,
      socialSecurityBenefit: 3_200,
      socialSecurityClaimAge: 68,
      pensionAmount: 1_500,
      pensionStartAge: 68,
      pensionCOLA: 0,
      pensionType: 'annuity',
      spouse: {
        enabled: true,
        currentAge: 68,
        retirementAge: 68,
        socialSecurityBenefit: 1_800,
        socialSecurityClaimAge: 68,
      },
    }),
    il: {
      paycheckMonthly: 11_400,
      successChecks: [
        { label: 'At their actual $8,000/mo spending', monthlySpending: 8_000, ilClaim: '“would show 97%”' },
      ],
    },
  },
];

function money(x: number): string {
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(0)}K`;
  return `$${Math.round(x)}`;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function successAtSpending(scenario: ScenarioInput, monthlySpending: number): number {
  const s: ScenarioInput = { ...scenario, baseMonthlySpending: monthlySpending };
  return runSimulation(s, { numSimulations: SIMS, seed: SEED }).successRate;
}

// Bisection over starting balance (spending fixed) — success is monotonic
// in balance. Balances are scaled proportionally across account types.
function solveGuardrailBalance(
  scenario: ScenarioInput,
  monthlySpending: number,
  targetSuccess: number,
): number {
  const baseTotal = Object.values(scenario.balances).reduce((a, b) => a + b, 0);
  const scaled = (total: number): AccountBalances => {
    const f = total / baseTotal;
    return Object.fromEntries(
      Object.entries(scenario.balances).map(([k, v]) => [k, v * f]),
    ) as AccountBalances;
  };

  let low = 50_000;
  let high = baseTotal * 4;
  for (let i = 0; i < GUARDRAIL_SEARCH_ITERS; i++) {
    const mid = (low + high) / 2;
    const s: ScenarioInput = {
      ...scenario,
      baseMonthlySpending: monthlySpending,
      balances: scaled(mid),
    };
    const success = runSimulation(s, { numSimulations: GUARDRAIL_SEARCH_SIMS, seed: SEED }).successRate;
    if (success < targetSuccess) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

interface CaseResult {
  c: ILCase;
  safeSpendingMonthly: number;
  successAtPaycheck: number;
  lowerGuardrail: number;
  upperGuardrail: number;
  successChecks: { label: string; monthlySpending: number; ilClaim?: string; ours: number }[];
}

function runCase(c: ILCase): CaseResult {
  console.log(`\n── ${c.id} ──`);

  console.log('  solving safe spending @ 80% success ...');
  const safe = findSafeSpending(c.scenario, PAYCHECK_TARGET_SUCCESS);

  console.log('  success rate at Income Lab paycheck ...');
  const successAtPaycheck = successAtSpending(c.scenario, c.il.paycheckMonthly);

  console.log('  solving lower guardrail balance (success = 25%) ...');
  const lowerGuardrail = solveGuardrailBalance(c.scenario, c.il.paycheckMonthly, LOWER_GUARDRAIL_SUCCESS);

  console.log('  solving upper guardrail balance (success = 99%) ...');
  const upperGuardrail = solveGuardrailBalance(c.scenario, c.il.paycheckMonthly, UPPER_GUARDRAIL_SUCCESS);

  const successChecks = (c.il.successChecks ?? []).map(chk => ({
    ...chk,
    ours: successAtSpending(c.scenario, chk.monthlySpending),
  }));

  return { c, safeSpendingMonthly: safe.monthlySpending, successAtPaycheck, lowerGuardrail, upperGuardrail, successChecks };
}

function buildReport(results: CaseResult[]): string {
  const lines: string[] = [];
  lines.push('# Income Lab Head-to-Head Comparison');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  if (FEE_DRAG > 0) {
    lines.push('');
    lines.push(`**Advisory fee drag applied: ${(FEE_DRAG * 100).toFixed(2)}%/yr** (subtracted from all asset-class mean returns).`);
  }
  lines.push('');
  lines.push('Rebuilds the worked examples published in Income Lab\'s "Retirement');
  lines.push('Income Guardrails: The Complete Guide" (2026) in our Monte Carlo engine');
  lines.push('and compares against their published outputs. Their default risk posture');
  lines.push('(20/80) means the "retirement paycheck" is spending at 80% success; the');
  lines.push('lower guardrail is the balance where success falls to 25%; the upper');
  lines.push('guardrail is where success reaches ~100% (we use 99%).');
  lines.push('');
  lines.push('Methodology differences (expect directional, not exact, agreement):');
  lines.push('mortality-weighted horizons vs our fixed end ages; historical-sequence');
  lines.push('replay vs our regime-switching MC; unpublished allocations/splits');
  lines.push('assumed as documented per scenario.');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Scenario | IL paycheck | Our safe spending @80% | Δ | Our success @ IL paycheck |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    const delta = r.safeSpendingMonthly - r.c.il.paycheckMonthly;
    const deltaPct = delta / r.c.il.paycheckMonthly;
    lines.push(
      `| ${r.c.id} | $${r.c.il.paycheckMonthly.toLocaleString()}/mo | $${Math.round(r.safeSpendingMonthly).toLocaleString()}/mo | ${delta >= 0 ? '+' : ''}${Math.round(delta).toLocaleString()} (${(deltaPct * 100).toFixed(0)}%) | ${pct(r.successAtPaycheck)} (theirs: ~80% by construction) |`,
    );
  }
  lines.push('');

  lines.push('## Guardrail Balances (at IL paycheck spending)');
  lines.push('');
  lines.push('| Scenario | Our lower (25% success) | IL lower | Our upper (99% success) | IL upper |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    const ilLower = r.c.il.lowerGuardrailBalance ? money(r.c.il.lowerGuardrailBalance) : '—';
    const ilUpper = r.c.il.upperGuardrailBalance ? money(r.c.il.upperGuardrailBalance) : '—';
    lines.push(`| ${r.c.id} | ${money(r.lowerGuardrail)} | ${ilLower} | ${money(r.upperGuardrail)} | ${ilUpper} |`);
  }
  lines.push('');

  for (const r of results) {
    lines.push(`## ${r.c.id}`);
    lines.push('');
    lines.push(r.c.description);
    lines.push('');
    lines.push('Assumptions for unpublished inputs:');
    for (const a of r.c.assumptions) lines.push(`- ${a}`);
    lines.push('');
    lines.push(`- IL retirement paycheck: **$${r.c.il.paycheckMonthly.toLocaleString()}/mo** · ours @80% success: **$${Math.round(r.safeSpendingMonthly).toLocaleString()}/mo**`);
    lines.push(`- Our success rate at their paycheck: **${pct(r.successAtPaycheck)}**`);
    if (r.c.il.lowerGuardrailBalance) {
      lines.push(`- Lower guardrail: ours **${money(r.lowerGuardrail)}** vs IL **${money(r.c.il.lowerGuardrailBalance)}**`);
    } else {
      lines.push(`- Lower guardrail (no IL reference): ours **${money(r.lowerGuardrail)}**`);
    }
    if (r.c.il.upperGuardrailBalance) {
      lines.push(`- Upper guardrail: ours **${money(r.upperGuardrail)}** vs IL **${money(r.c.il.upperGuardrailBalance)}**`);
    } else {
      lines.push(`- Upper guardrail (no IL reference): ours **${money(r.upperGuardrail)}**`);
    }
    for (const chk of r.successChecks) {
      const claim = chk.ilClaim ? ` · IL: ${chk.ilClaim}` : '';
      lines.push(`- ${chk.label} ($${chk.monthlySpending.toLocaleString()}/mo): ours **${pct(chk.ours)}**${claim}`);
    }
    lines.push('');
  }

  lines.push('## Omitted');
  lines.push('');
  lines.push('Mark & Linda (67/65, $1.6M, paycheck $9,200/mo, guardrails $1.95M/$1.15M)');
  lines.push('— their SS and pension amounts are not published, so the household');
  lines.push('cannot be rebuilt faithfully.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  console.log('Income Lab comparison — running ...');
  const results = CASES.map(runCase);

  const report = buildReport(results);
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, report);

  console.log('\n' + report);
  console.log(`\nReport written to ${OUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
