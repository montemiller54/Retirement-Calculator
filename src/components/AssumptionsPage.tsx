import React from 'react';

export function AssumptionsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h2 className="text-xl font-bold">Assumptions & Limitations</h2>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Tax Modeling</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Federal income tax uses estimated 2026 Head of Household brackets and standard deduction ($24,150).</li>
          <li>Long-term capital gains stack on top of ordinary income for bracket determination.</li>
          <li>Social Security benefits are taxed using the provisional income method (thresholds: $25K / $34K).</li>
          <li>Net Investment Income Tax (3.8%) applies above $200K AGI.</li>
          <li>Iowa uses a flat 3.8% tax rate. Social Security is exempt from Iowa tax.</li>
          <li>Iowa retirement income exclusion: taxpayers age 55+ pay no Iowa tax on retirement plan distributions or pension income.</li>
          <li>Tax brackets are NOT inflation-adjusted over the simulation period (simplification).</li>
          <li>AMT is not modeled.</li>
          <li>State/local tax deduction (SALT) cap is not explicitly modeled.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Contributions & Limits</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Default 2026 limits: 401(k) $24,500, IRA $7,500, HSA $4,400 (self-only).</li>
          <li>Catch-up contributions (age 50+) can be enabled: +$7,500 for 401(k), +$1,000 for IRA.</li>
          <li>If contributions exceed limits for a given account type, excess spills to taxable brokerage.</li>
          <li>Contribution limits (401k, IRA, catch-up, HSA) are inflation-indexed annually using the Tax Bracket Inflation rate (default 2%), matching IRS CPI adjustments.</li>
          <li>Employer match is NOT separately modeled—savings rate is "all-in."</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Investment Returns</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Stocks and crypto use a Student-t distribution with configurable degrees of freedom (default: 6) for fat tails. Bonds and cash use a Gaussian (normal) distribution.</li>
          <li>Correlations across asset classes use Cholesky decomposition of a fixed correlation matrix.</li>
          <li>Default correlation assumes stocks and bonds are slightly negatively correlated.</li>
          <li>Returns are applied annually (not monthly).</li>
          <li>Inflation is deterministic (not stochastic).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Withdrawals & RMDs</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>RMDs begin at age 73 using the IRS Uniform Lifetime Table.</li>
          <li>Roth 401(k) is treated like Roth IRA (no RMDs for owner) for simplicity.</li>
          <li>RMD amounts exceeding spending needs are moved to the taxable account (after taxes).</li>
          <li>Taxable account withdrawals realize gains proportionally based on the cost basis ratio.</li>
          <li>Cost basis is tracked as a simple aggregate ratio, not on a lot-by-lot basis.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">General</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
          <li>Single-person scenario only (no spouse/joint modeling).</li>
          <li>No estate taxes or inheritance modeling.</li>
          <li>No Social Security benefit calculation—user provides their estimated benefit amount.</li>
          <li>All data stays in your browser (localStorage). No network calls.</li>
          <li>1,000 Monte Carlo simulations provide a reasonable estimate; results vary by run unless a seed is set.</li>
          <li>Two-phase asset allocation: separate pre-retirement and post-retirement allocations with instant transition.</li>
          <li>All income and spending inputs are entered as monthly amounts; internally converted to annual for the simulation.</li>
        </ul>
      </section>
    </div>
  );
}
