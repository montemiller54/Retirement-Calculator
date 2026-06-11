/**
 * External benchmark harness.
 *
 * For each canonical scenario, runs:
 *   - Our Monte Carlo engine (with all extras disabled, so apples-to-apples)
 *   - Bengen-style historical rolling-window backtest
 *   - Pfau's published SAFEMAX lookup (if scenario matches)
 *   - FIRECalc scrape (opt-in via RUN_FIRECALC=1)
 *
 * Emits a markdown report to benchmarks/external-comparison.md.
 *
 * Usage:
 *   npx tsx scripts/external-benchmarks/run.ts
 *   RUN_FIRECALC=1 npx tsx scripts/external-benchmarks/run.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANONICAL_SCENARIOS, GK_SCENARIOS, type ExternalScenario } from './scenarios';
import { runBengen, type BengenResult } from './bengen-engine';
import { findPfauReference } from './pfau-reference';
import { runOurEngine, runOurEngineWithGuardrails, type OurEngineResult } from './our-engine-adapter';
import { runFirecalc, type FirecalcResult } from './firecalc';
import { runGuytonKlinger, findGKSafemax, findGKReference, type GKResult } from './guyton-klinger-engine';
import { loadHistoricalReturns } from './historical-data';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'benchmarks');
const OUT_FILE = join(OUT_DIR, 'external-comparison.md');

interface RowResult {
  scenario: ExternalScenario;
  ours: OurEngineResult;
  bengen: BengenResult | null;
  pfauSafemax: number | null;
  firecalc: FirecalcResult | null;
  firecalcError: string | null;
}

interface GKRow {
  scenario: ExternalScenario;
  iwr: number;
  gkHistorical: GKResult;
  gkSafemax: number;
  gkReferenceIwr: number | null;
  ourMcGuardrails: { successRate: number; medianEndingBalance: number; p10EndingBalance: number };
}

function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

function money(x: number): string {
  if (x <= 0) return '$0';
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(0)}K`;
  return `$${Math.round(x)}`;
}

function deltaTag(ours: number, ref: number, tolerance: number): string {
  const diff = ours - ref;
  const absPct = Math.abs(diff);
  if (absPct <= tolerance) return '✓';
  if (absPct <= tolerance * 2) return '⚠';
  return '✗';
}

async function main() {
  console.log('External benchmark harness — running ...\n');

  // 1. Verify historical data is present (Bengen engine needs it)
  let bengenAvailable = true;
  try {
    const hist = loadHistoricalReturns();
    console.log(`Historical data: ${hist.years.length} years (${hist.years[0]}–${hist.years[hist.years.length - 1]})\n`);
  } catch (e) {
    bengenAvailable = false;
    console.warn('Historical data not loaded:', (e as Error).message);
    console.warn('Bengen comparisons will be skipped.\n');
  }

  // 2. Check FIRECalc opt-in
  const runFc = process.env.RUN_FIRECALC === '1';
  if (runFc) console.log('FIRECalc scrape: ENABLED (network)\n');

  // 3. Run each scenario through every engine
  const results: RowResult[] = [];
  for (const s of CANONICAL_SCENARIOS) {
    console.log(`▸ ${s.id} — ${s.description}`);
    const ours = runOurEngine(s);
    const bengen = bengenAvailable ? runBengen(s) : null;
    const pfauRef = findPfauReference(s.stockPct, s.years);
    let firecalc: FirecalcResult | null = null;
    let firecalcError: string | null = null;
    if (runFc) {
      try { firecalc = await runFirecalc(s); }
      catch (e) { firecalcError = (e as Error).message; }
    }
    results.push({
      scenario: s,
      ours,
      bengen,
      pfauSafemax: pfauRef?.safemaxPct ?? null,
      firecalc,
      firecalcError,
    });
    console.log(`    ours success = ${pct(ours.successRate)}` +
      (bengen ? `,  Bengen = ${pct(bengen.successRate)}` : '') +
      (pfauRef ? `,  Pfau SAFEMAX = ${pct(pfauRef.safemaxPct, 2)}` : '') +
      (firecalc ? `,  FIRECalc = ${pct(firecalc.successRate)}` : '') +
      (firecalcError ? `,  FIRECalc ERR (${firecalcError})` : ''));
  }

  // 4. Run Guyton-Klinger comparisons (only if historical data available)
  const gkRows: GKRow[] = [];
  if (bengenAvailable) {
    console.log('\nGuyton-Klinger guardrails (historical + our engine):');
    for (const s of GK_SCENARIOS) {
      const ref = findGKReference(s.stockPct, s.years);
      const iwr = ref?.iwr ?? 0.054; // fall back to G&K's classic 5.4%
      console.log(`▸ ${s.id} — IWR ${pct(iwr, 1)}`);
      const gkHistorical = runGuytonKlinger(s, iwr);
      const gkSafemax = findGKSafemax(s, 0.99);
      const ourMcGuardrails = runOurEngineWithGuardrails(s, iwr);
      gkRows.push({
        scenario: s,
        iwr,
        gkHistorical,
        gkSafemax,
        gkReferenceIwr: ref?.iwr ?? null,
        ourMcGuardrails,
      });
      console.log(`    GK historical = ${pct(gkHistorical.successRate)},  GK SAFEMAX@99% = ${pct(gkSafemax, 2)},  our MC w/ guardrails = ${pct(ourMcGuardrails.successRate)}`);
    }
  }

  // 5. Write markdown report
  mkdirSync(OUT_DIR, { recursive: true });
  const md = buildMarkdown(results, gkRows, bengenAvailable, runFc);
  writeFileSync(OUT_FILE, md);
  console.log(`\nReport written: ${OUT_FILE}`);
}

function buildMarkdown(
  results: RowResult[],
  gkRows: GKRow[],
  bengenAvailable: boolean,
  ranFirecalc: boolean,
): string {
  const lines: string[] = [];
  lines.push('# External Benchmark Comparison');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push('Compares this calculator\'s Monte Carlo engine against established');
  lines.push('reference methodologies on identical apples-to-apples scenarios (single');
  lines.push('pool, constant real spending, no SS/pension/taxes/guardrails).');
  lines.push('');
  lines.push('Legend: ✓ within tolerance · ⚠ marginal · ✗ outside tolerance');
  lines.push('');

  // Success rate table
  lines.push('## Success Rate Comparison');
  lines.push('');
  const cols = ['Scenario', 'Ours (MC)', 'Bengen (historical)', 'FIRECalc', 'Δ vs Bengen'];
  lines.push('| ' + cols.join(' | ') + ' |');
  lines.push('|' + cols.map(() => '---').join('|') + '|');
  for (const r of results) {
    const oursStr = pct(r.ours.successRate);
    const bengenStr = r.bengen ? pct(r.bengen.successRate) : '—';
    const fcStr = r.firecalc ? pct(r.firecalc.successRate)
                : r.firecalcError ? `err: ${r.firecalcError.slice(0, 30)}`
                : ranFirecalc ? '—' : 'n/a';
    const delta = r.bengen
      ? `${((r.ours.successRate - r.bengen.successRate) * 100).toFixed(1)}pp ${deltaTag(r.ours.successRate, r.bengen.successRate, 0.05)}`
      : '—';
    lines.push(`| ${r.scenario.id} | ${oursStr} | ${bengenStr} | ${fcStr} | ${delta} |`);
  }
  lines.push('');
  lines.push('Tolerance: ±5pp ✓, ±10pp ⚠, beyond ✗ vs Bengen historical.');
  lines.push('');

  // SAFEMAX table
  lines.push('## SAFEMAX (max sustainable withdrawal rate)');
  lines.push('');
  const sCols = ['Scenario', 'Ours (99% target)', 'Bengen (100% historical)', 'Pfau ref', 'Δ vs Pfau'];
  lines.push('| ' + sCols.join(' | ') + ' |');
  lines.push('|' + sCols.map(() => '---').join('|') + '|');
  for (const r of results) {
    const oursStr = pct(r.ours.safemaxRate, 2);
    const bengenStr = r.bengen ? pct(r.bengen.safemaxRate, 2) : '—';
    const pfauStr = r.pfauSafemax != null ? pct(r.pfauSafemax, 2) : '—';
    const delta = r.pfauSafemax != null
      ? `${((r.ours.safemaxRate - r.pfauSafemax) * 100).toFixed(2)}pp ${deltaTag(r.ours.safemaxRate, r.pfauSafemax, 0.005)}`
      : '—';
    lines.push(`| ${r.scenario.id} | ${oursStr} | ${bengenStr} | ${pfauStr} | ${delta} |`);
  }
  lines.push('');
  lines.push('Tolerance: ±0.5pp ✓, ±1pp ⚠, beyond ✗ vs Pfau.');
  lines.push('');

  // Ending balance table
  lines.push('## Ending Balance Comparison (median / p10 / worst)');
  lines.push('');
  const eCols = ['Scenario', 'Ours median', 'Bengen median', 'Ours p10', 'Bengen p10', 'Ours worst', 'Bengen worst'];
  lines.push('| ' + eCols.join(' | ') + ' |');
  lines.push('|' + eCols.map(() => '---').join('|') + '|');
  for (const r of results) {
    lines.push(`| ${r.scenario.id} | ${money(r.ours.medianEndingBalance)} | ${r.bengen ? money(r.bengen.medianEndingBalance) : '—'} | ${money(r.ours.p10EndingBalance)} | ${r.bengen ? money(r.bengen.p10EndingBalance) : '—'} | ${money(r.ours.worstEndingBalance)} | ${r.bengen ? money(r.bengen.worstEndingBalance) : '—'} |`);
  }
  lines.push('');

  // Guyton-Klinger section
  if (gkRows.length > 0) {
    lines.push('## Guyton-Klinger Guardrails Comparison');
    lines.push('');
    lines.push('Compares three engines at a fixed initial withdrawal rate (IWR):');
    lines.push('1. **GK historical** — our G-K implementation run over rolling historical windows.');
    lines.push('2. **GK SAFEMAX@99%** — highest IWR at which our G-K implementation achieves 99% historical survival.');
    lines.push('3. **Our MC + guardrails** — our Monte Carlo engine with built-in drawdown-based guardrails enabled.');
    lines.push('');
    const gCols = ['Scenario', 'IWR tested', 'GK ref IWR', 'GK historical success', 'GK SAFEMAX@99%', 'Our MC w/ guardrails', 'Δ (Ours − GK hist)'];
    lines.push('| ' + gCols.join(' | ') + ' |');
    lines.push('|' + gCols.map(() => '---').join('|') + '|');
    for (const g of gkRows) {
      const delta = `${((g.ourMcGuardrails.successRate - g.gkHistorical.successRate) * 100).toFixed(1)}pp ${deltaTag(g.ourMcGuardrails.successRate, g.gkHistorical.successRate, 0.05)}`;
      lines.push(`| ${g.scenario.id} | ${pct(g.iwr, 1)} | ${g.gkReferenceIwr != null ? pct(g.gkReferenceIwr, 1) : '—'} | ${pct(g.gkHistorical.successRate)} | ${pct(g.gkSafemax, 2)} | ${pct(g.ourMcGuardrails.successRate)} | ${delta} |`);
    }
    lines.push('');
    lines.push('Tolerance: ±5pp ✓, ±10pp ⚠, beyond ✗ between engines.');
    lines.push('');
    lines.push('Reference: G&K (2006) reported ~99% historical survival for 65/35 with IWR 5.4% over 40 years.');
    lines.push('');
  }

  // Notes
  lines.push('## Methodology notes');
  lines.push('');
  lines.push('- **Bengen engine**: rolling N-year windows over Shiller annual real returns (stocks)');
  lines.push('  and a constant-duration model on 10yr Treasury yields (bonds, D=7).');
  lines.push('- **Pfau reference**: hardcoded published SAFEMAX values from Wade Pfau\'s historical tables.');
  lines.push('- **Guyton-Klinger engine**: classic 4-rule formulation. Capital Preservation cuts spending');
  lines.push('  10% when current WR exceeds initial WR by 20%; Prosperity raises spending 10% when current');
  lines.push('  WR falls 20% below initial WR. Working in real-return space, the Withdrawal Rule\'s skip-');
  lines.push('  inflation behavior is subsumed by the Capital Preservation cut.');
  lines.push('- **Our engine**: Monte Carlo with regime-switching returns. To match the comparison');
  lines.push('  engines we disable SS, pension, taxes, healthcare, and Roth conversions.');
  lines.push('- **FIRECalc**: only the spending/portfolio/years are passed; allocation cannot be set');
  lines.push('  through the basic form (defaults to 75/25 total market).');
  lines.push('');

  if (!bengenAvailable) {
    lines.push('> ⚠ Historical data was not available. Run `npx tsx scripts/external-benchmarks/fetch-data.ts` first.');
    lines.push('');
  }

  return lines.join('\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
