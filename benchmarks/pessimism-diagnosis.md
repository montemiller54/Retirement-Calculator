# Pessimism Diagnosis: Why Our MC Engine Is Tougher Than History

_Generated: 2026-06-11T18:54:20.817Z_

Subtracting an assumed long-run inflation of 2.5% to convert nominal MC returns to real terms for apples-to-apples comparison with Shiller historical data.

## Distribution Comparison: 75/25 Portfolio, 30-Year Sequences

| Source | Mean real return | Std | Median 30y CAGR | P10 30y CAGR | Worst 30y CAGR | Worst rolling 10y CAGR | % negative years |
|---|---|---|---|---|---|---|---|
| Historical 1872-2022 | 6.70% | 14.29% | 5.80% | 3.83% | 2.80% | -3.77% | 30% |
| Historical 1928-2022 | 6.82% | 13.64% | 6.20% | 3.99% | 3.47% | -3.11% | 27% |
| MC default (cf=5.5) | 6.81% | 14.16% | 5.96% | 1.98% | -4.59% | -16.39% | 27% |
| MC low crashes (cf=1) | 9.21% | 12.05% | 8.65% | 5.40% | -2.23% | -16.95% | 20% |

**H1 (mean returns too low?):** Default MC mean real return = 6.81% vs. Historical 1928+ = 6.82%. **REJECTED** — engine's central tendency is in line with modern history.

**H2 (fatter left tail?):** Worst 30-year CAGR — MC default = -4.59% vs. Historical 1928+ = 3.47%. Gap = 8.06%. **CONFIRMED** — MC's worst sequences are meaningfully worse than the worst 30 years US investors actually saw (1929, 1966, 2000).

## H3: Bengen Restricted to 1928+ Closes the Date-Bias Gap

| Scenario | Bengen full (1872+) | Bengen modern (1928+) | Our MC | Δ MC vs 1928+ |
|---|---|---|---|---|
| bengen-classic-50-50 | 94.3% | 89.4% (66 windows) | 90.8% | 1.4pp |
| trinity-75-25 | 96.7% | 93.9% (66 windows) | 86.5% | -7.4pp |
| conservative-60-40-3pct | 100.0% | 100.0% (66 windows) | 97.6% | -2.4pp |
| aggressive-60-40-5pct | 74.6% | 72.7% (66 windows) | 73.1% | 0.4pp |
| long-horizon-fire | 88.2% | 80.4% (46 windows) | 75.4% | -5.0pp |

If the gap is mostly driven by Bengen including the unusually-good 1872-1927 era, restricting to 1928+ should bring Bengen closer to our MC numbers.

## H4: Reduce Crash Frequency to Test Regime-Switching Impact

| Scenario | MC default (cf=5.5) | MC low crashes (cf=1) | Bengen 1928+ | Δ low-crash vs default |
|---|---|---|---|---|
| bengen-classic-50-50 | 90.8% | 98.8% | 89.4% | +8.0pp |
| trinity-75-25 | 86.5% | 98.1% | 93.9% | +11.5pp |
| conservative-60-40-3pct | 97.6% | 99.7% | 100.0% | +2.1pp |
| aggressive-60-40-5pct | 73.1% | 93.8% | 72.7% | +20.6pp |
| long-horizon-fire | 75.4% | 96.4% | 80.4% | +21.0pp |

If crash frequency is the main lever, low-crash MC should land near Bengen 1928+.

## Summary

See verdicts above. Common patterns:

- If H1 is REJECTED but H2 is CONFIRMED, the engine is correctly calibrated on average but models worse tail outcomes than US history. This is defensible (US 20th century was unusually good); calibrate to taste.
- If H3 closes most of the gap, Bengen-style comparisons are the misleading benchmark — they cherry-pick a favorable era.
- If H4 closes most of the gap, regime-switching is doing the heavy lifting on pessimism. The bear-frequency slider lets users calibrate this.
