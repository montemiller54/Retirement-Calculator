import React from 'react';

export function AssumptionsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h2 className="text-xl font-bold">Methodology</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        This page explains how the simulator works, how calculations are performed, and what assumptions are made.
      </p>

      {/* ── Monte Carlo Simulation ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Monte Carlo Simulation</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>The simulator runs <strong>5,000 independent paths</strong> from your current age to your end age, each with a different sequence of market returns, inflation, and regime transitions.</li>
          <li>A seeded pseudorandom number generator (SFC32, period ~2<sup>128</sup>) ensures results are reproducible for the same inputs.</li>
          <li><strong>Success rate</strong> = percentage of paths where the portfolio is not depleted by your end age.</li>
          <li><strong>Percentile bands</strong> (Best 10%, Best 25%, Typical, Worst 25%, Worst 10%) are computed by sorting total balances across all paths at each age.</li>
          <li><strong>Median path</strong>: average of paths ranked 45th–55th percentile (smoothed middle). <strong>Worst-decile path</strong>: average of the bottom 10% of paths.</li>
          <li><strong>Expected path</strong>: a single deterministic run using mean returns (zero volatility), representing the "no-surprise" outcome.</li>
        </ul>
      </section>

      {/* ── Year-by-Year Simulation Loop ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Year-by-Year Calculation Order</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Each simulated year processes these steps in order:</p>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal pl-4">
          <li><strong>Market regime transition</strong> — Markov chain determines bull or bear year (see Investment Returns below).</li>
          <li><strong>Generate correlated asset returns</strong> — one return per asset class, using the regime-appropriate correlation matrix.</li>
          <li><strong>Inflate spending</strong> — base spending × cumulative inflation factor (with optional year-to-year volatility).</li>
          <li><strong>Collect income</strong> — salary (if working), Social Security, pension, spouse income, other sources.</li>
          <li><strong>Make contributions</strong> — allocate savings across accounts, enforce IRS limits, add employer match.</li>
          <li><strong>Execute Roth conversions</strong> — if enabled, move funds from Traditional to Roth IRA (taxable event).</li>
          <li><strong>Calculate spending need</strong> — base spending + healthcare + one-time expenses + mortgage − guardrail adjustments.</li>
          <li><strong>Iterative tax-aware withdrawal loop</strong> — withdraw from accounts to cover spending + taxes, iterating up to 5 times until the withdrawal amount converges (within $100).</li>
          <li><strong>Calculate and pay taxes</strong> — federal, state, FICA, early withdrawal penalties, capital gains.</li>
          <li><strong>Reinvest surplus</strong> — if retirement income exceeds spending + taxes, excess goes to taxable account.</li>
          <li><strong>Apply investment returns</strong> — each account grows by its blended return (allocation × per-asset return).</li>
          <li><strong>Refill cash buffer</strong> — if enabled and markets were positive, replenish the reserve.</li>
          <li><strong>Depletion check</strong> — if total balance &lt; $100, mark path as failed.</li>
        </ol>
        <p className="text-xs text-gray-400 mt-1">All monthly user inputs (salary, spending, etc.) are converted to annual amounts internally. "Today's dollars" inputs are inflated forward from your current age.</p>
      </section>

      {/* ── Investment Returns ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Investment Returns</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Returns use a <strong>Markov regime-switching Gaussian mixture model</strong> with two regimes:</li>
        </ul>
        <div className="ml-4 mt-1">
          <table className="text-xs text-gray-600 dark:text-gray-400 border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left pr-4 pb-1 font-medium">Regime</th>
                <th className="text-right pr-4 pb-1 font-medium">Stock Mean</th>
                <th className="text-right pr-4 pb-1 font-medium">Stock Vol</th>
                <th className="text-right pr-4 pb-1 font-medium">Bond Mean</th>
                <th className="text-right pb-1 font-medium">Stock-Bond Corr</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-4 py-0.5">Bull (~82% of years)</td>
                <td className="text-right pr-4">+15.9%</td>
                <td className="text-right pr-4">15%</td>
                <td className="text-right pr-4">4.0%</td>
                <td className="text-right">−0.10</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5">Bear (~18% of years)</td>
                <td className="text-right pr-4">−18.0%</td>
                <td className="text-right pr-4">20%</td>
                <td className="text-right pr-4">6.5%</td>
                <td className="text-right">−0.35</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4 mt-2">
          <li><strong>Markov transitions</strong>: if the prior year was a bear market, there is a 55% chance the next year is also a bear market, producing realistic multi-year bear streaks averaging ~2.2 years (matching 1929–32, 1973–74, 2000–02, 2007–09).</li>
          <li>The <strong>"Bear Market Frequency" slider</strong> controls the long-run percentage of bear-market years: slider 1 = 5% (rare), default 5.5 = 18% (historical average), slider 10 = 30% (very frequent).</li>
          <li>At the default setting, crash frequencies match historical data: a −20% year occurs roughly every 11 years, −30% every 20 years, −40% every 42 years, and −50% every 104 years.</li>
          <li>Returns are clamped at −100% (an asset cannot lose more than its full value).</li>
          <li><strong>Regime-dependent correlations</strong>: in bear markets, stock-bond correlation strengthens to −0.35 (flight to quality) and stock-crypto correlation tightens from 0.30 to 0.50 (risk-off selling). Bonds also receive a mean boost in bear years (6.5% vs 4.0%) reflecting rate cuts.</li>
          <li>Regime switching applies to stocks and crypto. Bonds and cash always use Gaussian distributions (vol 6% and 1% respectively).</li>
          <li>Default returns (nominal): Stocks 10%/16% vol, Bonds 4%/6% vol, Cash 2.5%/1% vol, Crypto 15%/50% vol.</li>
          <li>Returns are generated using Cholesky decomposition of the regime-appropriate correlation matrix, producing properly correlated draws across all four asset classes.</li>
          <li>Returns are applied annually. No intra-year rebalancing.</li>
        </ul>
      </section>

      {/* ── Inflation ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Inflation</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Spending inflates at the configured rate (default 2.5%), compounding year-over-year.</li>
          <li>Optional inflation volatility adds annual Gaussian noise (default ±1.5%) to simulate real-world CPI uncertainty.</li>
          <li>Federal tax brackets, standard deduction, and contribution limits are indexed at 0.3% below the spending inflation rate (modeling chained CPI-U).</li>
        </ul>
      </section>

      {/* ── Tax Calculation ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Tax Calculation</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li><strong>Federal income tax</strong>: 2026 progressive brackets (10%–37%) applied to ordinary income (wages + traditional withdrawals + pension + taxable Social Security) minus the standard deduction.</li>
          <li><strong>Social Security taxation</strong>: uses the provisional income method — 0%, 50%, or 85% of benefits are taxable depending on total income (MFJ thresholds: $32K/$44K).</li>
          <li><strong>Long-term capital gains</strong>: taxed at 0%/15%/20% brackets that stack on top of ordinary income. Gains are computed proportionally using the aggregate cost basis ratio.</li>
          <li><strong>Net Investment Income Tax</strong>: 3.8% on investment income above AGI thresholds ($200K single, $250K MFJ).</li>
          <li><strong>FICA</strong> (employee portion): Social Security 6.2% (up to $176,100 wage base) + Medicare 1.45% + 0.9% Medicare surtax on high earners.</li>
          <li><strong>State tax</strong>: all 50 states + DC modeled with flat effective rates, Social Security exemptions, and age-gated retirement income exemptions.</li>
          <li><strong>Iterative convergence</strong>: withdrawals from pre-tax accounts increase taxable income, which increases taxes, which increases the withdrawal needed. The simulator iterates up to 5 times until the tax-inclusive withdrawal amount converges (within $100).</li>
          <li><strong>Limitations</strong>: standard deduction only (no itemized), no AMT, no short-term capital gains, state tax uses a single flat rate per state, no local/city taxes.</li>
        </ul>
      </section>

      {/* ── Withdrawals & RMDs ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Withdrawals & Required Minimum Distributions</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li><strong>Tax-efficient withdrawal order</strong>: Cash → Other Assets → Taxable → HSA → Trad 401(k) → Trad IRA → Roth 401(k) → Roth IRA. This depletes taxable accounts first and preserves tax-free Roth growth.</li>
          <li><strong>Pro-rata strategy</strong>: withdraws proportionally from all accounts based on balance.</li>
          <li><strong>RMDs</strong> begin at age 73 (SECURE 2.0). Formula: prior-year-end balance ÷ IRS Uniform Lifetime Table divisor. RMDs exceeding spending are reinvested into the taxable account (after taxes).</li>
          <li><strong>Early withdrawal penalty</strong>: 10% on traditional 401(k)/IRA before age 59½. Rule of 55 exempts 401(k) if eligible. Roth contributions are always penalty-free; earnings and conversions follow the 5-year rule.</li>
          <li>Capital gains on taxable withdrawals use proportional cost basis tracking (not lot-by-lot).</li>
        </ul>
      </section>

      {/* ── Contributions ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Contributions & Employer Match</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Contributions are allocated by user-defined percentages across 8 account types (must sum to 100%).</li>
          <li><strong>IRS limits enforced</strong>: 401(k) $24,500, IRA $7,500, HSA $4,400 (2026 values). Catch-up: +$7,500 for 401(k) at 50+, +$1,000 for IRA. SECURE 2.0 super catch-up: +$11,250 for 401(k) at ages 60–63.</li>
          <li>Excess contributions above limits automatically spill over to the taxable brokerage account.</li>
          <li>Employer match: configurable rate and cap. Match does not count against employee deferral limits. All contribution limits are inflation-indexed annually.</li>
        </ul>
      </section>

      {/* ── Social Security ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Social Security</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li><strong>Auto-estimate mode</strong>: calculates your Primary Insurance Amount (PIA) from current salary using the SSA bend-point formula (90%/32%/15% of AIME) with 2025 thresholds.</li>
          <li><strong>Full Retirement Age</strong>: 66 for birth year ≤ 1954, graduating to 67 for 1960+.</li>
          <li><strong>Early claiming</strong>: reduced by 5/9% per month for the first 36 months before FRA, then 5/12% per additional month.</li>
          <li><strong>Delayed retirement credits</strong>: +8% per year (2/3% per month) from FRA to age 70.</li>
          <li>Spousal benefit: 50% of primary PIA when spouse has no earnings. Configurable COLA (default 2%).</li>
          <li><strong>Earnings test</strong>: before FRA, benefits are reduced by $0.50 per $1 earned above threshold (~$23,400).</li>
          <li>Assumes current salary approximates career-average earnings. No survivor benefits or WEP/GPO.</li>
        </ul>
      </section>

      {/* ── Roth Conversions ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Roth Conversions</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Two strategies: <strong>Fill Tax Bracket</strong> (convert up to a target bracket, e.g., 12%) or <strong>Fixed Amount</strong> (convert a set amount per year).</li>
          <li>Active between configurable start and end ages. Conversion amount is included in taxable income for the year.</li>
          <li>Funds move from Traditional 401(k)/IRA to Roth IRA, split proportionally between traditional accounts.</li>
        </ul>
      </section>

      {/* ── Safe Spending ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Safe Spending Calculation</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Uses <strong>binary search</strong> over monthly spending levels to find the amount that achieves a target success rate (e.g., 90%).</li>
          <li>Each candidate spending level is tested with 1,000 simulations. The search converges within $25/month over up to 20 iterations.</li>
          <li>The final safe spending level is validated with a full 5,000-simulation run.</li>
          <li>Guardrails are disabled during the search to produce a fixed-spending safe level.</li>
        </ul>
      </section>

      {/* ── Other Features ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Other Features</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li><strong>Healthcare</strong>: three-tier cost model (pre-Medicare / Medicare / late-life) with separate medical inflation rate (default 5%). Costs are added on top of base spending.</li>
          <li><strong>Housing</strong>: mortgage payment added to spending until payoff age. Optional downsizing proceeds deposited at a specified age, appreciating at inflation + 1%.</li>
          <li><strong>Spending safety rules (guardrails)</strong>: configurable spending-cut tiers triggered by portfolio drawdown from peak. Multiple tiers allow graduated responses.</li>
          <li><strong>Cash buffer</strong>: reserve of N years' expenses in cash, refilled when markets are up, spent first in down markets.</li>
          <li><strong>Spouse</strong>: separate age, retirement age, salary, Social Security, and pension. Spouse savings go to the shared taxable account.</li>
          <li><strong>Asset allocation</strong>: separate pre-retirement and post-retirement allocations with instant transition at retirement. Per-account customization available.</li>
          <li><strong>One-time expenses</strong> at specified ages, optionally inflation-adjusted. Additional income sources with configurable start/end ages.</li>
        </ul>
      </section>

      {/* ── Privacy & Limitations ── */}
      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Privacy & Limitations</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>All data stays in your browser (localStorage). No data is sent to any server.</li>
          <li>No estate taxes, inheritance, or beneficiary modeling.</li>
          <li>HSA withdrawals are not restricted to qualified medical expenses.</li>
          <li>No Roth IRA income limits, backdoor Roth, or mega-backdoor Roth.</li>
          <li>No lot-by-lot cost basis, no Joint Life RMD table, no 72(t)/SEPP distributions.</li>
          <li>Taxable interest from bond/cash holdings is not computed (hardcoded to $0).</li>
        </ul>
      </section>
    </div>
  );
}
