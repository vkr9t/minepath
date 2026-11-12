import type { LeverKey, MacEntry, Scenario, ScenarioResult } from './types';
import { LEVER_LABELS } from './scenario';
import type { MonteCarloResult } from './montecarlo';

export interface RecommendationInput {
  scenario: Scenario;
  result: ScenarioResult;
  mac: MacEntry[];
  mc: MonteCarloResult;
  includeScope3: boolean;
  scope3T: number;
  demoAssumptionCount: number;
  totalAssumptionCount: number;
  baseYear: number;
  horizonEnd: number;
  mineLabel: string;
  captureAvailable: boolean;
}

export interface RecommendationLever {
  lever: LeverKey;
  label: string;
  window: string;
  adoption: number;
  macText: string;
  note?: string;
}

export interface Recommendation {
  headline: string;
  levers: RecommendationLever[];
  costLine: string;
  neutralityLine: string;
  withoutCreditsLine: string | null;
  scope3Line: string;
  assumptions: string[];
  disclaimer: string;
}

const crore = (inr: number) => inr / 1e7; // INR → crore
const fmtCr = (inr: number) => `₹${crore(inr).toLocaleString('en-IN', { maximumFractionDigits: 1 })} crore`;
const fmtT = (t: number) => `${Math.round(t).toLocaleString('en-IN')} tCO2e`;

export function yearText(y: number | null, horizonEnd: number): string {
  return y === null ? `not reached by ${horizonEnd}` : String(y);
}

export function rangeText(mc: MonteCarloResult, horizonEnd: number): string {
  const lo = mc.p10 === null ? `beyond ${horizonEnd}` : String(mc.p10);
  const hi = mc.p90 === null ? `beyond ${horizonEnd}` : String(mc.p90);
  return `${lo} to ${hi}`;
}

/** Order: enabled levers by ascending MAC (cheapest first; money-saving levers lead). */
export function buildRecommendation(inp: RecommendationInput): Recommendation {
  const { scenario, result, mac, mc, horizonEnd } = inp;
  const enabled = mac.filter((m) => scenario.levers[m.lever].enabled);
  const levers: RecommendationLever[] = enabled.map((m) => {
    const s = scenario.levers[m.lever];
    let macText: string;
    if (m.lever === 'credits') {
      macText = `price-driven: about ₹${Math.round(m.macPerT ?? 0).toLocaleString('en-IN')}/tCO2e (offset, not a physical reduction)`;
    } else if (m.macPerT === null) {
      macText = 'no measurable abatement in this scenario';
    } else if (m.macPerT < 0) {
      macText = `about ₹${Math.round(m.macPerT).toLocaleString('en-IN')}/tCO2e (net saving over the horizon, estimated)`;
    } else {
      macText = `about ₹${Math.round(m.macPerT).toLocaleString('en-IN')}/tCO2e abated (estimated)`;
    }
    const lever: RecommendationLever = {
      lever: m.lever,
      label: LEVER_LABELS[m.lever],
      window: `${s.startYear} → full effect ${s.rampYear}`,
      adoption: s.adoption,
      macText,
    };
    if (m.lever === 'capture' && !inp.captureAvailable) {
      lever.note = 'Capture is marked unavailable for this mine, so this lever has no effect.';
    }
    if (m.lever === 'ev') {
      lever.note = 'Adds grid electricity demand; pair with the renewable PPA to avoid shifting emissions to Scope 2.';
    }
    return lever;
  });

  const totalAbated = enabled.reduce((s, m) => s + Math.max(0, m.abatedT), 0);
  const blendedMac = totalAbated > 0 ? result.totals.costPV / totalAbated : null;

  const neutral = result.neutralityYear;
  const neutralityLine =
    `Estimated net-zero year (deterministic): ${yearText(neutral, horizonEnd)}. ` +
    `Monte Carlo P10–P90 (${mc.iterations.toLocaleString('en-IN')} runs): ${rangeText(mc, horizonEnd)}` +
    (mc.probNotReached > 0 ? `; ${(mc.probNotReached * 100).toFixed(0)}% of runs do not reach net zero by ${horizonEnd}.` : '.');

  const usesCredits = scenario.levers.credits.enabled;
  const withoutCreditsLine = usesCredits
    ? `Excluding credits, net zero is ${result.neutralityYearExCredits === null ? `not reached by ${horizonEnd}` : `reached in ${result.neutralityYearExCredits}`}. Credits are offsets and are not counted as emission reductions.`
    : null;

  const headline =
    neutral === null
      ? `${scenario.name} does not reach net zero by ${horizonEnd} for ${inp.mineLabel}. Stronger levers or earlier timing are needed (estimate).`
      : `${scenario.name} is estimated to reach net zero in ${neutral} for ${inp.mineLabel}, with the uncertainty range shown below (estimate).`;

  const costLine =
    `Estimated horizon cost: ${fmtCr(result.totals.costNominal)} nominal, ${fmtCr(result.totals.costPV)} present value` +
    (blendedMac !== null ? `; blended about ₹${Math.round(blendedMac).toLocaleString('en-IN')} per tCO2e abated (sum of isolated lever abatement, so interactions are not netted).` : '.') +
    ` Cumulative ${inp.baseYear}–${horizonEnd}: gross ${fmtT(result.totals.gross)}, removals ${fmtT(result.totals.removals)} (estimated), credits ${fmtT(result.totals.credits)}.`;

  const scope3Line = inp.includeScope3
    ? `Scope 3 (downstream coal combustion) is shown as a memo item of about ${fmtT(inp.scope3T)} per year and is NOT included in the inventory or the net-zero calculation.`
    : 'Scope 3 is not included in this assessment.';

  const assumptions = [
    `${inp.demoAssumptionCount} of ${inp.totalAssumptionCount} assumptions are demo values awaiting verified replacements; treat every figure here as illustrative until they are replaced.`,
    'Removals come from a modelled growth curve and are estimates, not verified sequestration.',
    'Methane intensity is the largest single uncertainty, especially for underground mines.',
    'Lever abatement and cost are computed per lever against a no-lever baseline; combined effects differ slightly.',
    'Cost inputs are placeholders and exclude financing, taxes and inflation.',
  ];

  return {
    headline,
    levers,
    costLine,
    neutralityLine,
    withoutCreditsLine,
    scope3Line,
    assumptions,
    disclaimer:
      'This output is a planning estimate for discussion. It is not professional engineering, regulatory, or investment advice.',
  };
}
