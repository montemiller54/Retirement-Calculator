# Bear-Cluster Diagnosis

_Generated: 2026-06-11T16:30:31.649Z_

How often do 30-year sequences contain runs of N consecutive bear/negative years? 10,000 MC samples vs 66 historical 30-year windows (1928+, 75/25 portfolio).

## Share of 30-Year Windows Containing N+ Consecutive Negative Real Years

Compares the most universal definition of a "bad streak": consecutive years where the real blended return was negative.

| Run length | Historical 1928+ | MC default (cf=5.5) | MC low (cf=1) | MC vs Hist (default) |
|---|---|---|---|---|
| ≥1 years | 100.0% | 100.0% | 99.9% | -0.0pp |
| ≥2 years | 100.0% | 85.7% | 66.1% | -14.3pp |
| ≥3 years | 34.8% | 40.4% | 20.6% | +5.6pp |
| ≥4 years | 0.0% | 12.9% | 5.3% | +12.9pp |
| ≥5 years | 0.0% | 2.5% | 1.1% | +2.5pp |
| ≥6 years | 0.0% | 0.4% | 0.3% | +0.4pp |
| ≥7 years | 0.0% | 0.0% | 0.1% | +0.0pp |
| ≥8 years | 0.0% | 0.0% | 0.0% | +0.0pp |

## Share of 30-Year Windows Containing N+ Consecutive Bear-Regime Years (MC Only)

Bear-regime years are the engine's Markov state, distinct from any individual year's realized return. This shows how sticky the bear regime itself is.

| Run length | MC default (cf=5.5) | MC low (cf=1) |
|---|---|---|
| ≥1 years | 98.3% | 62.1% |
| ≥2 years | 75.8% | 31.0% |
| ≥3 years | 40.4% | 12.9% |
| ≥4 years | 17.1% | 4.9% |
| ≥5 years | 0.0% | 0.0% |
| ≥6 years | 0.0% | 0.0% |
| ≥7 years | 0.0% | 0.0% |
| ≥8 years | 0.0% | 0.0% |

## Maximum Run Length Per 30-Year Window (Negative-Return Years)

| Stat | Historical 1928+ | MC default | MC low crash |
|---|---|---|---|
| Median max-run | 2 | 2 | 2 |
| P90 max-run | 3 | 4 | 3 |
| P99 max-run | 3 | 5 | 5 |
| Worst-case max-run | 3 | 8 | 9 |

## Verdict

- **4+ year negative-return streaks** happen in 0.0% of historical 30-year windows but 12.9% of MC default windows (∞× more often).
- **5+ year streaks** are never seen historically but appear in 2.5% of MC default windows.
- **Worst-ever historical streak**: 3 consecutive negative years. **Worst MC streak**: 8 consecutive negative years.

If the MC engine produces 4–8 year streaks at meaningfully higher rates than history, this is the mechanism causing the engine's pessimistic tail outcomes seen in `pessimism-diagnosis.md`.
