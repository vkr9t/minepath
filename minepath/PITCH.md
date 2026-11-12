# MinePath: pitch script and judge Q&A (CodeSpark 2026)

Track: Sustainability & Social Impact · PS: Coal-Mine Carbon Accounting & Neutrality Pathway Simulator

## 5-minute structure (maps to the 100-point sheet)

| Time | Beat | Rubric line |
|---|---|---|
| 0:00–0:40 | Problem: a mine must PROVE its Scope 1+2 numbers and show a credible route to neutrality. Spreadsheets hide uncertainty and let credits masquerade as cuts. | Problem Identification (10) |
| 0:40–1:10 | What is different: (1) uncertainty as P10–P90, not one date; (2) net-zero integrity bar: real cuts vs removals vs credits; (3) sensitivity: which assumption matters most; (4) plan finder: cheapest plan under a credit cap. | Innovativeness (20) |
| 1:10–4:10 | Click "▶ Guided demo" (about 3 minutes, 8 steps, switches tabs for you). | Solution + working demo (20), UI (15) |
| 4:10–4:40 | Honesty: 4 factors verified with source/year/link (IPCC 2019 methane, GWP, CEA grid); 25 clearly labelled demo assumptions; engine is pure functions with 41 tests. | Solution (20) |
| 4:40–5:00 | Impact: a mine can see in minutes whether its plan is real, what data to verify first, and what it costs. Ask for questions. | Overall Impact (10) |

Rehearse once with a timer. If short on time, skip steps 2 and 8 of the guided demo (Next button).

## Numbers to know (current sample data, verify on screen before quoting)
- Underground sample: methane is most of gross emissions; Scenario B reaches net zero about 2037 only with credits (~100% of remaining emissions): integrity shows "weak". The tool says so out loud.
- Open-cast sample: about 0.10 tCO2e per tonne coal; much less methane.
- Top sensitivity driver for the underground mine: methane intensity.
- Plan finder default: target 2038, credit cap 100%; lower the cap to 60% on the underground mine and it reports honestly that no tested plan qualifies.

## Likely judge questions, honest answers

**Are the emission factors official?** Four are read from primary sources and carry source, year and link: methane intensities (IPCC 2019 Refinement Vol 2 Ch 4, Tier 1 defaults converted at 0.67 kg/m3), methane GWP (GHG Protocol / IPCC AR6, fossil 29.8), and the grid factor (CEA CO2 Baseline v17, FY2020-21, 0.79). The other 25 are labelled "demo assumption: replace with a verified factor". Nothing is claimed as official unless it was read from the source.

**Why not newer CEA data?** We read v17. Newer CEA versions exist; the factor is editable and the note says to match your reporting year.

**Why is the open-cast methane so low compared with your earlier numbers?** We replaced a placeholder with the IPCC Tier 1 surface-mining default. A mine-specific measurement should override it (override field on Inputs).

**Is the MAC realistic?** Each lever is costed alone against the no-lever baseline, levelised on discounted tonnes. Interactions are not captured. Fleet electrification looks very expensive alone because it moves load to a coal-heavy grid; paired with a renewable PPA the picture changes. Costs are demo assumptions.

**Is carbon credit-based net zero real?** That is exactly why we show it separately: the integrity bar, "net zero excluding credits", and the plan finder's credit cap. Our own underground sample is credit-dependent and we flag it.

**How do you handle uncertainty?** Triangular distributions from low/central/high in the assumptions file, sampled once per run, seeded for reproducibility; sliders widen or narrow groups. The tornado is a one-at-a-time check.

**What does the plan finder actually do?** Grid search over 0/50/100% adoption of each lever and three afforestation sizes, credits sized to close the residual in the target year, ranked by PV cost. It is not a global optimiser; timing is fixed.

**What about Scope 3?** Shown as a memo only, not mixed into Scope 1+2 totals.

**Limitations?** No real mine data, annual resolution, central factors in plan finder, sink curve is generic, no state-level or mine-specific grid. Not professional engineering, regulatory or investment advice.

**What next?** Import CSV of real activity data, mine-specific methane measurements, a verified cost library, joint lever optimisation.
