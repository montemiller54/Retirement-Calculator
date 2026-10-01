# Income Lab Head-to-Head Comparison

_Generated: 2026-09-20T20:16:02.332Z_

Rebuilds the worked examples published in Income Lab's "Retirement
Income Guardrails: The Complete Guide" (2026) in our Monte Carlo engine
and compares against their published outputs. Their default risk posture
(20/80) means the "retirement paycheck" is spending at 80% success; the
lower guardrail is the balance where success falls to 25%; the upper
guardrail is where success reaches ~100% (we use 99%).

Methodology differences (expect directional, not exact, agreement):
mortality-weighted horizons vs our fixed end ages; historical-sequence
replay vs our regime-switching MC; unpublished allocations/splits
assumed as documented per scenario.

## Summary

| Scenario | IL paycheck | Our safe spending @80% | Δ | Our success @ IL paycheck |
|---|---|---|---|---|
| sarah-tom | $9,200/mo | $9,817/mo | +617 (7%) | 89.0% (theirs: ~80% by construction) |
| margaret | $7,100/mo | $8,374/mo | +1,274 (18%) | 94.9% (theirs: ~80% by construction) |
| robert-linda | $11,400/mo | $14,780/mo | +3,380 (30%) | 98.2% (theirs: ~80% by construction) |

## Guardrail Balances (at IL paycheck spending)

| Scenario | Our lower (25% success) | IL lower | Our upper (99% success) | IL upper |
|---|---|---|---|---|
| sarah-tom | $1.04M | $1.45M | $2.78M | $2.15M |
| margaret | $699K | $1.05M | $1.79M | — |
| robert-linda | $951K | — | $2.73M | — |

## sarah-tom

Sarah & Tom — both 62, just retired, $1.8M (trad IRA + taxable), SS $2,800 + $2,200/mo at 67

Assumptions for unpublished inputs:
- Trad IRA / taxable split not published → assumed $900K / $900K, 80% cost basis
- Allocation not published → 60/40; state-neutral (TX)
- Horizon: fixed end age 97 (≈30% joint longevity risk for a 62yo couple)

- IL retirement paycheck: **$9,200/mo** · ours @80% success: **$9,817/mo**
- Our success rate at their paycheck: **89.0%**
- Lower guardrail: ours **$1.04M** vs IL **$1.45M**
- Upper guardrail: ours **$2.78M** vs IL **$2.15M**
- At their $10,000/mo combined target ($10,000/mo): ours **76.9%** · IL: “roughly 80%”

## margaret

Margaret — widow 71, $1.2M trad IRA + $200K Roth, SS $3,100/mo (collecting)

Assumptions for unpublished inputs:
- Allocation not published → 60/40; state-neutral (TX)
- Horizon: fixed end age 94 (≈30% longevity risk for a 71yo female)
- SS claim age set to 71 (already collecting; benefit in today's dollars)

- IL retirement paycheck: **$7,100/mo** · ours @80% success: **$8,374/mo**
- Our success rate at their paycheck: **94.9%**
- Lower guardrail: ours **$699K** vs IL **$1.05M**
- Upper guardrail (no IL reference): ours **$1.79M**
- At her $6,800/mo essential need ($6,800/mo): ours **96.7%**

## robert-linda

Robert & Linda — both 68, $2.5M (tax-deferred + taxable), pension $1,500/mo, SS $3,200 + $1,800/mo (collecting)

Assumptions for unpublished inputs:
- Tax-deferred / taxable split not published → assumed $1.25M / $1.25M, 80% cost basis
- Pension COLA not published → 0%; allocation → 60/40; state-neutral (TX)
- Horizon: fixed end age 96 (≈30% joint longevity risk for a 68yo couple)

- IL retirement paycheck: **$11,400/mo** · ours @80% success: **$14,780/mo**
- Our success rate at their paycheck: **98.2%**
- Lower guardrail (no IL reference): ours **$951K**
- Upper guardrail (no IL reference): ours **$2.73M**
- At their actual $8,000/mo spending ($8,000/mo): ours **100.0%** · IL: “would show 97%”

## Omitted

Mark & Linda (67/65, $1.6M, paycheck $9,200/mo, guardrails $1.95M/$1.15M)
— their SS and pension amounts are not published, so the household
cannot be rebuilt faithfully.
