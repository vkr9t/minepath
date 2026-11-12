import type { CostSet, LeverKey, NormalizedInputs, ParamKey, ParamRanges, ParamSet, Scenario, ScenarioResult } from './types';
import { disableAll, simulateScenario, type SimOptions } from './scenario';

/* ------------------------------------------------------------------ */
/* Sensitivity (one-at-a-time / tornado)                               */
/* ------------------------------------------------------------------ */

export interface SensitivityRow {
  key: ParamKey;
  low: number;
  mode: number;
  high: number;
  /** Cumulative net emissions over the horizon with this parameter at its low / high value (others central). */
  cumNetLow: number;
  cumNetHigh: number;
  /** Net-zero year with the parameter at low / high (null = not reached by the horizon). */
  yearLow: number | null;
  yearHigh: number | null;
  /** |cumNetHigh − cumNetLow|, used for ranking. */
  swing: number;
}

export interface SensitivityResult {
  centralCumNet: number;
  centralYear: number | null;
  rows: SensitivityRow[]; // sorted by swing, largest first
}

export function paramSetFromModes(ranges: ParamRanges): ParamSet {
  const out = {} as ParamSet;
  (Object.keys(ranges) as ParamKey[]).forEach((k) => (out[k] = ranges[k].mode));
  return out;
}

export function runSensitivity(
  norm: NormalizedInputs,
  scenario: Scenario,
  ranges: ParamRanges,
  costs: CostSet,
  opts: SimOptions,
): SensitivityResult {
  const central = paramSetFromModes(ranges);
  const base = simulateScenario(norm, scenario, central, costs, opts);
  const last = (r: ScenarioResult) => r.rows[r.rows.length - 1].cumNet;
  const rows: SensitivityRow[] = (Object.keys(ranges) as ParamKey[]).map((key) => {
    const r = ranges[key];
    const lo = simulateScenario(norm, scenario, { ...central, [key]: r.low }, costs, opts);
    const hi = simulateScenario(norm, scenario, { ...central, [key]: r.high }, costs, opts);
    return {
      key,
      low: r.low,
      mode: r.mode,
      high: r.high,
      cumNetLow: last(lo),
      cumNetHigh: last(hi),
      yearLow: lo.neutralityYear,
      yearHigh: hi.neutralityYear,
      swing: Math.abs(last(hi) - last(lo)),
    };
  });
  rows.sort((a, b) => b.swing - a.swing);
  return { centralCumNet: last(base), centralYear: base.neutralityYear, rows };
}

/* ------------------------------------------------------------------ */
/* Net-zero integrity: how much of the closure is real?                */
/* ------------------------------------------------------------------ */

export type IntegrityGrade = 'strong' | 'moderate' | 'weak' | 'n/a';

export interface CreditDependence {
  year: number;
  baselineGross: number; // gross emissions in that year with no levers
  reductions: number; // baselineGross − scenario gross (real abatement)
  removals: number;
  credits: number;
  residualGross: number; // scenario gross
  /** Shares of baseline gross; reductions + removals + credits + unclosed = 1 (unclosed can be negative if over-closed). */
  shareReductions: number;
  shareRemovals: number;
  shareCredits: number;
  shareUnclosed: number;
  /** credits ÷ scenario gross in that year. */
  creditShareOfResidual: number;
  grade: IntegrityGrade;
}

/** Thresholds are a transparent rule of thumb for this tool, not a standard. */
export function gradeCredits(creditShareOfResidual: number, residual: number): IntegrityGrade {
  if (residual <= 0) return 'n/a';
  if (creditShareOfResidual < 0.2) return 'strong';
  if (creditShareOfResidual <= 0.5) return 'moderate';
  return 'weak';
}

export function creditDependence(result: ScenarioResult, baseline: ScenarioResult, year: number): CreditDependence {
  const i = Math.min(Math.max(0, result.rows.findIndex((r) => r.year === year)), result.rows.length - 1);
  const idx = result.rows.findIndex((r) => r.year === year) < 0 ? result.rows.length - 1 : i;
  const row = result.rows[idx];
  const b = baseline.rows[idx];
  const bg = b.gross;
  const reductions = bg - row.gross;
  const share = (x: number) => (bg > 0 ? x / bg : 0);
  return {
    year: row.year,
    baselineGross: bg,
    reductions,
    removals: row.removals,
    credits: row.credits,
    residualGross: row.gross,
    shareReductions: share(reductions),
    shareRemovals: share(row.removals),
    shareCredits: share(row.credits),
    shareUnclosed: share(row.gross - row.removals - row.credits),
    creditShareOfResidual: row.gross > 0 ? row.credits / row.gross : 0,
    grade: gradeCredits(row.gross > 0 ? row.credits / row.gross : 0, row.gross),
  };
}

/* ------------------------------------------------------------------ */
/* Plan finder: cheapest lever mix that reaches net zero by a target   */
/* ------------------------------------------------------------------ */

export interface PlanFinderOptions {
  targetYear: number;
  /** Max credits ÷ residual gross in the target year (0..1). */
  maxCreditShare: number;
  captureAvailable: boolean;
  levels?: number[]; // adoption % levels tried per lever
  afforestationHa?: number[]; // additional hectares tried
}

export interface Plan {
  scenario: Scenario;
  result: ScenarioResult;
  adoption: { ev: number; capture: number; ppa: number; ha: number };
  creditVolume: number;
  creditShare: number;
  costPV: number;
}

export interface PlanFinderResult {
  evaluated: number;
  feasible: number;
  plans: Plan[]; // cheapest first
  infeasibleReason: string | null;
}

/** Fixed, readable timing for the searched plans: levers start early and ramp in 4–8 years. */
function timing(key: LeverKey, base: number, target: number) {
  const full = Math.min(target - 1, base + (key === 'afforestation' ? 7 : key === 'ev' ? 7 : 4));
  return { startYear: base + (key === 'ev' ? 2 : key === 'afforestation' ? 1 : 1), rampYear: Math.max(base + 2, full) };
}

export function findPlans(
  norm: NormalizedInputs,
  template: Scenario,
  params: ParamSet,
  costs: CostSet,
  sim: SimOptions,
  o: PlanFinderOptions,
): PlanFinderResult {
  const levels = o.levels ?? [0, 50, 100];
  const hectares = o.afforestationHa ?? [0, 400, 1200];
  const captureLevels = o.captureAvailable ? levels : [0];
  const zero = disableAll(template);
  const plans: Plan[] = [];
  let evaluated = 0;

  for (const ev of levels)
    for (const cap of captureLevels)
      for (const ppa of levels)
        for (const ha of hectares) {
          const s: Scenario = JSON.parse(JSON.stringify(zero));
          s.id = 'plan';
          s.name = 'Plan finder';
          s.locked = false;
          const set = (k: LeverKey, adoption: number, extra: object = {}) => {
            s.levers[k] = { ...s.levers[k], enabled: adoption > 0, adoption, ...timing(k, sim.baseYear, o.targetYear), ...extra };
          };
          set('ev', ev);
          set('capture', cap);
          set('ppa', ppa);
          set('afforestation', ha > 0 ? 100 : 0, { additionalHa: ha });
          s.levers.credits = { ...s.levers.credits, enabled: false, adoption: 100, volume: 0, startYear: o.targetYear - 4, rampYear: o.targetYear - 1 };

          const pre = simulateScenario(norm, s, params, costs, sim);
          evaluated++;
          const row = pre.rows.find((r) => r.year === o.targetYear);
          if (!row) continue;
          const residual = Math.max(0, row.gross - row.removals);
          const volume = Math.ceil(residual);
          if (volume > 0) s.levers.credits = { ...s.levers.credits, enabled: true, volume };
          const result = volume > 0 ? simulateScenario(norm, s, params, costs, sim) : pre;
          const ny = result.neutralityYear;
          if (ny === null || ny > o.targetYear) continue;
          const t = result.rows.find((r) => r.year === o.targetYear)!;
          const share = t.gross > 0 ? t.credits / t.gross : 0;
          if (share > o.maxCreditShare + 1e-9) continue;
          plans.push({ scenario: s, result, adoption: { ev, capture: cap, ppa, ha }, creditVolume: volume, creditShare: share, costPV: result.totals.costPV });
        }

  plans.sort((a, b) => a.costPV - b.costPV);
  return {
    evaluated,
    feasible: plans.length,
    plans: plans.slice(0, 5),
    infeasibleReason:
      plans.length === 0
        ? `No tested combination reaches net zero by ${o.targetYear} with credits at or below ${(o.maxCreditShare * 100).toFixed(0)}% of residual emissions. Raise the credit cap, move the target later, or review the mine inputs.`
        : null,
  };
}
