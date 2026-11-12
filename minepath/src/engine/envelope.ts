import type { CostSet, NormalizedInputs, ParamKey, ParamRanges, ParamSet, Scenario } from './types';
import { simulateScenario, type SimOptions } from './scenario';
import { PARAM_GROUP, type Spread } from './montecarlo';

export interface SinkEnvelopePoint {
  year: number;
  low: number;
  central: number;
  high: number;
}

/**
 * Deterministic low / central / high removal estimate per year.
 * "Low" takes every sink parameter at its unfavourable end, "high" at its favourable end
 * (a higher shape parameter p delays removal, so it is unfavourable). Ranges are scaled by
 * the user's sink-uncertainty multiplier. This is an envelope, not a probability interval;
 * the Monte Carlo run gives the probabilistic view.
 */
export function sinkEnvelope(
  norm: NormalizedInputs,
  scenario: Scenario,
  ranges: ParamRanges,
  costs: CostSet,
  opts: SimOptions,
  spread: Spread,
): SinkEnvelopePoint[] {
  const s = Math.max(0, spread.sinks);
  const pick = (key: ParamKey, end: 'low' | 'high'): number => {
    const r = ranges[key];
    if (PARAM_GROUP[key] !== 'sinks') return r.mode;
    let v = end === 'low' ? r.mode - s * (r.mode - r.low) : r.mode + s * (r.high - r.mode);
    v = Math.max(0, v);
    if (key === 'survival') v = Math.min(1, v);
    return v;
  };
  const build = (end: 'low' | 'high'): ParamSet => {
    const out = {} as ParamSet;
    (Object.keys(ranges) as ParamKey[]).forEach((k) => {
      // p works in reverse: lower p → faster early removal
      const e = k === 'p' ? (end === 'low' ? 'high' : 'low') : end;
      out[k] = pick(k, e);
    });
    return out;
  };
  const central = {} as ParamSet;
  (Object.keys(ranges) as ParamKey[]).forEach((k) => {
    central[k] = ranges[k].mode;
  });
  const lo = simulateScenario(norm, scenario, build('low'), costs, opts);
  const hi = simulateScenario(norm, scenario, build('high'), costs, opts);
  const ce = simulateScenario(norm, scenario, central, costs, opts);
  return ce.rows.map((r, i) => ({
    year: r.year,
    low: lo.rows[i].removals,
    central: r.removals,
    high: hi.rows[i].removals,
  }));
}
