import type { CostSet, NormalizedInputs, ParamKey, ParamRanges, ParamSet, Scenario } from './types';
import { simulateScenario, type SimOptions } from './scenario';

/** Small, fast, seedable PRNG so Monte Carlo runs are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample from a triangular distribution with the given low / mode / high. */
export function triangular(u: number, low: number, mode: number, high: number): number {
  if (high - low < 1e-15) return mode;
  const c = (mode - low) / (high - low);
  if (u < c) return low + Math.sqrt(u * (high - low) * (mode - low));
  return high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

/** Which user-adjustable uncertainty slider scales which parameter. */
export type SpreadGroup = 'factors' | 'methane' | 'sinks';
export const PARAM_GROUP: Record<ParamKey, SpreadGroup> = {
  efDiesel: 'factors',
  efGrid: 'factors',
  efExplosives: 'factors',
  scope3Ef: 'factors',
  gridDecline: 'factors',
  evKwhPerL: 'factors',
  evMaxShare: 'factors',
  ch4Intensity: 'methane',
  gwp: 'methane',
  destruction: 'methane',
  cmax: 'sinks',
  k: 'sinks',
  p: 'sinks',
  survival: 'sinks',
  soilMult: 'sinks',
};

/** Multipliers on each group's (low, high) distance from the central value. 1 = ranges as configured, 0 = no uncertainty. */
export type Spread = Record<SpreadGroup, number>;
export const DEFAULT_SPREAD: Spread = { factors: 1, methane: 1, sinks: 1 };

const FRACTION_KEYS: ParamKey[] = ['destruction', 'survival', 'evMaxShare'];

/** Draw one parameter set; each parameter is sampled ONCE per run (it is uncertain, not noisy per year). */
export function sampleParams(ranges: ParamRanges, spread: Spread, rng: () => number): ParamSet {
  const out = {} as ParamSet;
  (Object.keys(ranges) as ParamKey[]).forEach((key) => {
    const r = ranges[key];
    const s = Math.max(0, spread[PARAM_GROUP[key]]);
    let low = r.mode - s * (r.mode - r.low);
    let high = r.mode + s * (r.high - r.mode);
    low = Math.max(0, low);
    if (FRACTION_KEYS.includes(key)) high = Math.min(1, high);
    const u = rng(); // always consume one draw per parameter so seeds line up across settings
    out[key] = triangular(u, low, r.mode, Math.max(high, r.mode));
  });
  return out;
}

/** Nearest-rank percentile of an ascending-sorted array. Infinity means "not reached by the horizon". */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export interface BandPoint {
  year: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloResult {
  iterations: number;
  seed: number;
  deterministicYear: number | null;
  /** null means "not reached within the horizon" */
  p10: number | null;
  p50: number | null;
  p90: number | null;
  probNotReached: number; // 0..1
  histogram: { year: number; count: number }[]; // plus a final bucket for "beyond horizon"
  beyondCount: number;
  cumNetBand: BandPoint[];
  netBand: BandPoint[];
  grossBand: BandPoint[];
}

export function runMonteCarlo(
  norm: NormalizedInputs,
  scenario: Scenario,
  ranges: ParamRanges,
  costs: CostSet,
  opts: SimOptions,
  settings: { iterations: number; seed: number; spread: Spread },
): MonteCarloResult {
  const { iterations, seed, spread } = settings;
  const nYears = opts.horizonEnd - opts.baseYear + 1;
  const rng = mulberry32(seed);

  const central = {} as ParamSet;
  (Object.keys(ranges) as ParamKey[]).forEach((k) => {
    central[k] = ranges[k].mode;
  });
  const det = simulateScenario(norm, scenario, central, costs, opts);

  const years: number[] = [];
  const cum: number[][] = Array.from({ length: nYears }, () => []);
  const net: number[][] = Array.from({ length: nYears }, () => []);
  const gross: number[][] = Array.from({ length: nYears }, () => []);

  for (let it = 0; it < iterations; it++) {
    const params = sampleParams(ranges, spread, rng);
    const res = simulateScenario(norm, scenario, params, costs, opts);
    years.push(res.neutralityYear === null ? Infinity : res.neutralityYear);
    for (let i = 0; i < nYears; i++) {
      cum[i].push(res.rows[i].cumNet);
      net[i].push(res.rows[i].net);
      gross[i].push(res.rows[i].gross);
    }
  }

  years.sort((a, b) => a - b);
  const toYear = (v: number): number | null => (Number.isFinite(v) ? v : null);

  const band = (arrs: number[][]): BandPoint[] =>
    arrs.map((vals, i) => {
      const s = [...vals].sort((a, b) => a - b);
      return { year: opts.baseYear + i, p10: percentile(s, 0.1), p50: percentile(s, 0.5), p90: percentile(s, 0.9) };
    });

  const counts = new Map<number, number>();
  let beyond = 0;
  years.forEach((y) => {
    if (Number.isFinite(y)) counts.set(y, (counts.get(y) ?? 0) + 1);
    else beyond++;
  });
  const histogram: { year: number; count: number }[] = [];
  for (let y = opts.baseYear; y <= opts.horizonEnd; y++) histogram.push({ year: y, count: counts.get(y) ?? 0 });

  return {
    iterations,
    seed,
    deterministicYear: det.neutralityYear,
    p10: toYear(percentile(years, 0.1)),
    p50: toYear(percentile(years, 0.5)),
    p90: toYear(percentile(years, 0.9)),
    probNotReached: iterations > 0 ? beyond / iterations : 0,
    histogram,
    beyondCount: beyond,
    cumNetBand: band(cum),
    netBand: band(net),
    grossBand: band(gross),
  };
}
