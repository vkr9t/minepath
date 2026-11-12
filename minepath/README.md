# MinePath — coal-mine carbon accounting & neutrality pathway simulator

Interactive planning dashboard (React + TypeScript + Vite + Recharts). No backend, no paid APIs.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine test suite (vitest)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```
Requires Node 18+.

## Using it
1. Pick **Open-cast** or **Underground** in the header (each keeps its own edits; "Reset to sample" restores them).
2. **Mine inputs**: edit activity data with units; invalid or implausible values are flagged.
3. **Inventory**: Scope 1+2 by source with activity, factor, formula, result, factor range and source.
4. **Pathway**: edit Scenario A/B levers (start year, full-effect year, adoption). Charts: stacked emissions, net with P10–P90 band, cumulative lines, waterfall, scenario comparison.
5. **Sinks / Costs & MAC / Uncertainty / Recommendation / Assumptions & sources**.

State is saved in browser localStorage; "Reset everything" in the footer clears it.

## Layout
- `src/engine/` — pure, UI-free calculation code (validation, inventory, capture, sink curve, scenario simulation, MAC, Monte Carlo, recommendation) + `engine.test.ts`.
- `src/config/assumptions.json` — every factor, range, cost and status. `src/config/samples.json` — the two illustrative mines and their scenarios.
- `src/tabs/`, `src/components/`, `src/lib/` — UI.

## Data honesty
**All 29 assumptions are demo values**, labelled "demo assumption—replace with a verified factor". None is an official IPCC or CEA number, and source URLs only point to places where verified values can be looked up. Sample mines and scenario sizes are invented. Edit values on *Assumptions & sources* (or in the JSON), enter source/year, and set status to *verified*.

## Key modelling choices
- Net = gross − removals − credits, but gross, removals and credits are always shown separately. Net-zero year = first year with annual net ≤ 0; a second figure excludes credits.
- Levers ramp linearly from start year to full-effect year. Fleet electrification adds grid demand; methane capture needs capture marked available.
- Sinks: Chapman–Richards stock curve per planting cohort, annual removal = change in stock × survival.
- MAC = PV cost ÷ discounted tCO2e abated, each lever alone vs a no-lever baseline.
- Monte Carlo: seeded, triangular sampling once per run, default 1,000 runs.

## Limitations
- Costs and factors are placeholders; results are illustrative only.
- Isolated MAC does not capture lever interactions (e.g. electric fleet needs the PPA to cut emissions).
- Electrification applies the same share to haulage and equipment diesel; production growth scales all activity uniformly.
- Scope 3 is a memo estimate only. No soil-carbon dynamics beyond a user-supplied annual estimate.
- Single-threaded Monte Carlo; 5,000 runs × 3 scenarios is the practical ceiling for smooth sliders.


## Added for evaluation
- Verified factors (4): methane intensities (IPCC 2019 Refinement Vol 2 Ch 4), methane GWP (GHG Protocol / IPCC AR6), grid factor (CEA v17 FY2020-21). Everything else remains a labelled demo assumption.
- Insights tab: sensitivity (tornado) and net-zero integrity (real cuts vs removals vs credits).
- Plan finder tab: cheapest lever mix for a target year under a credit cap; apply a plan to Scenario A or B.
- Guided demo: header button, ~3 minutes, 8 steps.
- PITCH.md: 5-minute script mapped to the scoring sheet and judge Q&A.
- Saved browser state key bumped to v2 so old demo factors do not shadow the verified ones.

## Redesign (UI/UX)
Design direction from the UI/UX Pro Max workflow (dashboard type system Fira Sans/Fira Code, trust-first pattern, "no greenwashing"): deep-ink and glacier-teal palette; warm red = emissions, green = removals, violet = credits, blue = uncertainty; amber dashed edge = demo assumption, green edge = verified.
- Hero landing, live six-stage pipeline (status and results come from real app state), plain-words guide.
- Journey stepper with live status; one primary button per screen.
- Assumptions & sources: search, status and category filters, collapsible groups, expandable details.

## Editorial redesign + brand
- Theme: near-black panels, warm off-white canvas, orange CTAs; Anton display type for titles and headline numbers only, Fira Sans/Code for data. Subtle grain and contour lines appear on the hero only.
- Brand assets in `public/` (sources in `brand/`): `favicon.svg`, `favicon-16/32/48.png`, `apple-touch-icon.png`, `icon-192/512.png`, `minepath-mark.svg`, `minepath-lockup-on-light.svg`, `minepath-lockup-on-dark.svg` (wordmark converted to paths). In-app logo: `src/components/Logo.tsx`.
