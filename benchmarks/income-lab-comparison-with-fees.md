# Income Lab Head-to-Head Comparison

_Generated: 2026-09-20T20:23:44.152Z_

**Advisory fee drag applied: 0.90%/yr** (subtracted from all asset-class mean returns).

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
| sarah-tom | $9,200/mo | $9,434/mo | +234 (3%) | 82.8% (theirs: ~80% by construction) |
| margaret | $7,100/mo | $7,888/mo | +788 (11%) | 91.7% (theirs: ~80% by construction) |
| robert-linda | $11,400/mo | $13,973/mo | +2,573 (23%) | 96.9% (theirs: ~80% by construction) |

## Guardrail Balances (at IL paycheck spending)

| Scenario | Our lower (25% success) | IL lower | Our upper (99% success) | IL upper |
|---|---|---|---|---|
| sarah-tom | $1.12M | $1.45M | $3.09M | $2.15M |
| margaret | $751K | $1.05M | $1.96M | — |
| robert-linda | $1.03M | — | $3.02M | — |

## sarah-tom

Sarah & Tom — both 62, just retired, $1.8M (trad IRA + taxable), SS $2,800 + $2,200/mo at 67

Assumptions for unpublished inputs:
- Trad IRA / taxable split not published → assumed $900K / $900K, 80% cost basis
- Allocation not published → 60/40; state-neutral (TX)
- Horizon: fixed end age 97 (≈30% joint longevity risk for a 62yo couple)

- IL retirement paycheck: **$9,200/mo** · ours @80% success: **$9,434/mo**
- Our success rate at their paycheck: **82.8%**
- Lower guardrail: ours **$1.12M** vs IL **$1.45M**
- Upper guardrail: ours **$3.09M** vs IL **$2.15M**
- At their $10,000/mo combined target ($10,000/mo): ours **68.3%** · IL: “roughly 80%”

## margaret

Margaret — widow 71, $1.2M trad IRA + $200K Roth, SS $3,100/mo (collecting)

Assumptions for unpublished inputs:
- Allocation not published → 60/40; state-neutral (TX)
- Horizon: fixed end age 94 (≈30% longevity risk for a 71yo female)
- SS claim age set to 71 (already collecting; benefit in today's dollars)

- IL retirement paycheck: **$7,100/mo** · ours @80% success: **$7,888/mo**
- Our success rate at their paycheck: **91.7%**
- Lower guardrail: ours **$751K** vs IL **$1.05M**
- Upper guardrail (no IL reference): ours **$1.96M**
- At her $6,800/mo essential need ($6,800/mo): ours **94.7%**

## robert-linda

Robert & Linda — both 68, $2.5M (tax-deferred + taxable), pension $1,500/mo, SS $3,200 + $1,800/mo (collecting)

Assumptions for unpublished inputs:
- Tax-deferred / taxable split not published → assumed $1.25M / $1.25M, 80% cost basis
- Pension COLA not published → 0%; allocation → 60/40; state-neutral (TX)
- Horizon: fixed end age 96 (≈30% joint longevity risk for a 68yo couple)

- IL retirement paycheck: **$11,400/mo** · ours @80% success: **$13,973/mo**
- Our success rate at their paycheck: **96.9%**
- Lower guardrail (no IL reference): ours **$1.03M**
- Upper guardrail (no IL reference): ours **$3.02M**
- At their actual $8,000/mo spending ($8,000/mo): ours **100.0%** · IL: “would show 97%”

## Omitted

Mark & Linda (67/65, $1.6M, paycheck $9,200/mo, guardrails $1.95M/$1.15M)
— their SS and pension amounts are not published, so the household
cannot be rebuilt faithfully.
