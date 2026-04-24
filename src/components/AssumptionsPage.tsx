import React from 'react';

export function AssumptionsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h2 className="text-xl font-bold">Assumptions & Limitations</h2>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Simulation Engine</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Monte Carlo simulation runs 5,000 paths from current age to end age.</li>
          <li>Each simulated year processes: income → contributions → Roth conversions → spending → withdrawals → taxes → investment returns → cash buffer refill.</li>
          <li>Results include success rate, percentile bands (Best 10% / Best 25% / Typical / Worst 25% / Worst 10%), median/average/worst-decile paths, ending balance distribution, and depletion ages.</li>
          <li>All monthly user inputs (salary, spending, etc.) are converted to annual amounts internally.</li>
          <li>All "today's dollars" inputs (spending, healthcare) are inflated from your current age forward, not from your retirement age.</li>
          <li>Surplus retirement income (income exceeding spending + taxes) is reinvested into the taxable account.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Investment Returns</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Stocks and crypto use a statistical model that accounts for rare market crashes being more likely than a simple bell curve suggests. Bonds and cash use a standard bell curve.</li>
          <li>The crash model increases effective volatility to about 1.22× the displayed Variability (technically: vol × √(df/(df−2)) at df = 6). Default values are calibrated so effective volatility matches historical observations (~19.5% for stocks, ~61% for crypto).</li>
          <li>Default returns: Stocks 10%/16% vol, Bonds 4%/6% vol, Cash 2.5%/1% vol, Crypto 15%/50% vol (all nominal).</li>
          <li>Cross-asset correlations use Cholesky decomposition of a fixed correlation matrix (e.g., stocks-bonds: −0.10, stocks-crypto: 0.30).</li>
          <li>Returns are applied annually (not monthly). No intra-year rebalancing.</li>
          <li>Inflation varies year-to-year with a built-in 1.5% standard deviation around the configured spending inflation rate, modeling real-world inflation uncertainty.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Contributions & Employer Match</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Contributions are allocated by user-defined percentages across 8 account types (must sum to 100%).</li>
          <li>IRS limits enforced: 401(k) $24,500, IRA $7,500, HSA $4,400 (2026 values, self-only).</li>
          <li>Catch-up contributions for age 50+: +$7,500 for 401(k), +$1,000 for IRA. SECURE 2.0 super catch-up: +$11,250 for 401(k) at ages 60–63.</li>
          <li>Excess contributions above limits automatically spill over to the taxable brokerage account.</li>
          <li>Employer match: configurable match rate and cap (% of salary). Match can be split between Traditional and Roth 401(k). Match does not count against employee deferral limits.</li>
          <li>All contribution limits are inflation-indexed annually at 0.3% below the spending inflation rate.</li>
          <li>No Roth IRA income limits, backdoor Roth, or mega-backdoor Roth modeling.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Tax Modeling</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Federal income tax uses estimated 2026 progressive brackets (10%–37%) with standard deduction. Supports Head of Household, Married Filing Jointly, and Single filing statuses.</li>
          <li>Long-term capital gains use 3-tier brackets (0%/15%/20%) stacked on top of ordinary income.</li>
          <li>Net Investment Income Tax (3.8%) applies above AGI thresholds ($200K HOH/Single, $250K MFJ).</li>
          <li>Social Security benefits taxed using the provisional income method (0%/50%/85% taxable tiers).</li>
          <li>SS & Medicare Tax (FICA): employee-side Social Security (6.2% up to $176,100 wage base) + Medicare (1.45%) + Medicare surtax (0.9% above threshold).</li>
          <li>State income tax: all 50 states + DC modeled with flat effective rates, Social Security exemptions, and age-gated retirement income exemptions (e.g., Iowa: 3.8% rate, full retirement income exemption at age 55+).</li>
          <li>All federal brackets, deductions, and thresholds are inflation-indexed annually at 0.3% below the spending inflation rate (modeling chained CPI-U).</li>
          <li>Iterative tax-aware withdrawal loop: withdrawals are recalculated up to 5 times to converge on the correct amount needed to cover spending + taxes on the withdrawal itself.</li>
          <li>Limitations: standard deduction only (no itemized), no AMT, no short-term capital gains, no qualified dividends tracked separately, state tax uses a single flat rate (not actual progressive brackets), no local/city taxes.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Withdrawals & Required Minimum Distributions (RMDs)</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Three withdrawal strategies: Tax-Efficient, Roth-Preserving, and Pro-Rata (proportional by balance).</li>
          <li>Tax-Efficient/Roth-Preserving order: Cash → Other Assets → Taxable → HSA → Trad 401(k) → Trad IRA → Roth 401(k) → Roth IRA.</li>
          <li>RMDs begin at age 73 (SECURE 2.0) using the IRS Uniform Lifetime Table, computed separately for 401(k) and IRA.</li>
          <li>RMDs exceeding spending needs are reinvested into the taxable account (after taxes).</li>
          <li>RMD calculation uses prior-year-end balances (per IRS requirement).</li>
          <li>Taxable account withdrawals realize capital gains proportionally based on the aggregate cost basis ratio.</li>
          <li>Roth 401(k) is treated like Roth IRA (no RMDs for owner).</li>
          <li>Limitations: no lot-by-lot cost basis tracking, no Joint Life table for much-younger spouse, no 72(t)/SEPP distributions.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Early Withdrawal Penalties</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>10% early withdrawal penalty applies to Traditional 401(k)/IRA withdrawals before age 59½.</li>
          <li>Rule of 55: if eligible and age 55+, 401(k) withdrawals are penalty-free.</li>
          <li>Roth IRA: contributions (basis) are always penalty-free; only earnings are subject to penalty before 59½.</li>
          <li>Roth 5-year rule: converted amounts are subject to penalty if withdrawn within 5 years of conversion and before age 59½.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Social Security</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Auto-estimate mode: calculates your benefit from current salary using the Social Security Administration (SSA) formula with 2025 thresholds. If you are already retired with $0 salary, switch to manual entry.</li>
          <li>Full Retirement Age by birth year (66 for ≤1954, graduating to 67 for 1960+).</li>
          <li>Early claiming reduction: 5/9% per month for first 36 months before FRA, 5/12% after.</li>
          <li>Delayed retirement credits: 8% per year (2/3% per month) up to age 70.</li>
          <li>Manual mode: user enters their own monthly benefit amount.</li>
          <li>Spousal benefit: 50% of primary PIA when spouse has no earnings.</li>
          <li>Configurable Yearly Increase / COLA (default 2%).</li>
          <li>Limitations: assumes current salary approximates career-average AIME (35+ years of similar earnings), no survivor benefits, no WEP/GPO.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Spouse Support</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Optional spouse with separate age, retirement age, salary, salary growth, Social Security benefit/claim age, and pension.</li>
          <li>Spouse salary contributes to household income; spouse savings allocated to the shared taxable account.</li>
          <li>Spouse Social Security and pension begin at their respective configured ages.</li>
          <li>Limitation: no separate spouse 401(k)/IRA accounts — all spouse retirement savings go to the shared taxable brokerage.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Tax-Bracket Conversions (Roth Conversions)</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Optional Tax-Bracket Conversion (Roth conversion) strategy active between configurable start and end ages.</li>
          <li>Two strategies: Fill Tax Rate (e.g., fill up to the 12% bracket) or convert a Fixed Amount per year.</li>
          <li>Converted amounts are moved from Traditional IRA to Roth IRA and included in taxable income for the year.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Healthcare Cost Modeling</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Optional three-tier healthcare cost model: Before Age 65 (pre-Medicare), Medicare (age 65+), and Late-Life (age 80+).</li>
          <li>Default monthly costs: $1,500 Before Age 65, $500 Medicare, $1,000 Late-Life.</li>
          <li>Separate Medical Inflation rate (default 5%) applied to healthcare costs, inflated from your current age forward.</li>
          <li>Healthcare costs are added on top of base spending.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Housing / Mortgage</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Optional mortgage modeling: monthly mortgage payment is added to spending until a configurable payoff age.</li>
          <li>Downsizing proceeds: optional one-time lump sum deposited into the taxable account at a specified age.</li>
          <li>Downsizing proceeds appreciate at inflation + 1% annually (historical real home appreciation).</li>
          <li>Mortgage payments are inflation-adjusted; enter today's equivalent.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Part-Time Retirement Income</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Optional part-time income during early retirement, with a configurable monthly amount and end age.</li>
          <li>Part-time income is inflation-adjusted and included in taxable earned income.</li>
          <li>Subject to Social Security earnings test if claimed before Full Retirement Age.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Emergency Cash Reserve & Spending Safety Rules</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Emergency Cash Reserve (cash buffer): configurable number of years of expenses held in cash account, refilled when markets are up.</li>
          <li>Spending Safety Rules (guardrails): configurable spending-cut tiers based on portfolio drawdown from peak. When the portfolio drops below a threshold, spending is reduced by a configured percentage.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Asset Allocation</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Separate pre-retirement and post-retirement allocations with instant transition at retirement age.</li>
          <li>Risk Profile presets: Conservative (35/50/15 stocks/bonds/cash), Balanced (60/30/10), or Aggressive (80/15/5). Post-retirement automatically steps down one risk level.</li>
          <li>Customize mode: set per-account allocations for each phase independently.</li>
          <li>Four asset classes: Stocks, Bonds, Cash, Crypto.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">General</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>All data stays in your browser (localStorage). No data is sent to any server.</li>
          <li>5,000 Monte Carlo simulations per run (±1% confidence interval on success rate).</li>
          <li>Supports one-time expenses (e.g., home purchase) at specified ages, optionally inflation-adjusted.</li>
          <li>Supports additional income sources with configurable start/end ages and inflation rates.</li>
          <li>No estate taxes, inheritance, or beneficiary modeling.</li>
          <li>Health Savings Account (HSA) withdrawals are not restricted to qualified medical expenses (treated as a general account).</li>
          <li>"Already retired" mode: if your retirement age ≤ current age, contributions and employer match are skipped and only post-retirement allocations are used.</li>
          <li>Taxable interest from bond/cash holdings is not computed (hardcoded to $0).</li>
        </ul>
      </section>
    </div>
  );
}
