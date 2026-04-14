# Retirement Planner

A privacy-first, client-side-only retirement planning web application with Monte Carlo simulation. All calculations run in your browser — no data leaves your device.

## Features

- **Monte Carlo Simulation**: 1,000 simulations with per-asset-class distributions (Student-t fat tails for stocks/crypto, Gaussian for bonds/cash) and correlated returns (Cholesky decomposition)
- **Tax Modeling**: 2026 Federal (Head of Household) income tax brackets, LTCG, Social Security taxation, FICA, and Iowa state tax (3.8% flat with retirement income exemption)
- **Per-Account Asset Allocation**: Define separate allocations per account type, with pre-retirement and post-retirement phases
- **Withdrawal Strategies**: Tax-efficient, Roth-preserving, and pro-rata strategies with full RMD modeling (age 73+)
- **Guardrails**: Dynamic spending cuts triggered by portfolio drawdowns from high-water mark
- **Interactive Controls**: Retirement age slider, what-if scenarios, risk profile presets
- **Visualizations**: Fan chart (P10-P90), ending balance histogram, cashflow breakdown, taxes over time, trajectory table
- **Scenario Management**: Save/load named scenarios via localStorage, export/import JSON
- **System-Adaptive Theme**: Respects OS dark/light preference with manual toggle

## Tech Stack

- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3
- Recharts
- Web Worker for simulation engine
- Vitest for unit tests

## Run Locally

```bash
cd "Retirement Planner"
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Run Tests

```bash
npm test
```

## Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── types/                # TypeScript interfaces
├── constants/            # Tax brackets, IRS limits, RMD table, asset classes
├── engine/               # Core simulation logic
│   ├── math.ts           # PRNG, Cholesky, Student-t, correlated returns
│   ├── tax.ts            # Federal + Iowa tax calculations
│   ├── rmd.ts            # Required Minimum Distributions
│   ├── contributions.ts  # IRS limit enforcement, spillover
│   ├── withdrawals.ts    # Withdrawal strategies + RMD enforcement
│   ├── simulation.ts     # Main Monte Carlo loop
│   └── simulation.worker.ts  # Web Worker entry
├── hooks/                # React hooks (useSimulation, useTheme)
├── context/              # ScenarioContext (state management)
├── components/
│   ├── Sidebar/          # Input sections (Profile, Earnings, Portfolio, etc.)
│   ├── Results/          # Charts and summary components
│   ├── ScenarioManager.tsx
│   └── AssumptionsPage.tsx
├── utils/                # Formatting, localStorage helpers
└── __tests__/            # Vitest unit tests
```

## Key Assumptions

See the **Assumptions** tab in the app for a complete list. Highlights:

- Tax brackets are 2026 estimates, not inflation-adjusted over time
- Single person, Head of Household filing status
- Iowa: 3.8% flat rate, retirement income exempt age 55+
- RMDs start at age 73 (SECURE 2.0)
- Roth 401(k) treated like Roth IRA (no owner RMDs)
- Returns: annual, Student-t(df=6) for stocks/crypto, Gaussian for bonds/cash, with fixed correlation matrix
- Inflation is deterministic
- Cost basis tracked as aggregate ratio, not per-lot
