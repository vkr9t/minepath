import { describe, expect, it } from 'vitest';
import assumptionsJson from '../config/assumptions.json';
import samples from '../config/samples.json';
import {
  annualRemovalPerHa,
  capturedFraction,
  carbonStock,
  computeInventory,
  computeMac,
  computeWaterfall,
  dieselEmissions,
  disableAll,
  electricityEmissions,
  explosivesEmissions,
  firstNeutralYear,
  intensityPerTonne,
  inventoryTotals,
  methaneAfterCapture,
  methaneEmissions,
  mulberry32,
  percentile,
  ramp,
  resolveCosts,
  resolveParams,
  resolveRanges,
  runMonteCarlo,
  sinkEnvelope,
  buildRecommendation,
  rangeText,
  simulateScenario,
  toBase,
  validateInputs,
  type Assumptions,
  type RawInputs,
  type Scenario,
} from './index';

const A = assumptionsJson as unknown as Assumptions;
const OPTS = { baseYear: A.baseYear, horizonEnd: A.horizonEnd };
const opencastRaw = samples.opencast.inputs as unknown as RawInputs;
const undergroundRaw = samples.underground.inputs as unknown as RawInputs;
const scenarios = samples.underground.scenarios as unknown as Scenario[];
const balanced = scenarios.find((s) => s.id === 'balanced')!;
const baselineScenario = scenarios.find((s) => s.id === 'baseline')!;

function setup(raw: RawInputs) {
  const v = validateInputs(raw);
  const params = resolveParams(A, v.normalized);
  const ranges = resolveRanges(A, v.normalized);
  const costs = resolveCosts(A);
  return { norm: v.normalized, params, ranges, costs, v };
}

describe('unit normalisation and validation', () => {
  it('converts units to base units', () => {
    expect(toBase('coal', 3, 'Mt')).toBe(3_000_000);
    expect(toBase('diesel', 12, 'ML')).toBe(12_000_000);
    expect(toBase('electricity', 30, 'GWh')).toBe(30_000_000);
    expect(toBase('explosives', 8000, 't')).toBe(8_000_000);
    expect(Number.isNaN(toBase('coal', 1, 'parsec'))).toBe(true);
  });

  it('normalises sample inputs and equipment litres = hours × rate', () => {
    const { norm, v } = setup(opencastRaw);
    expect(v.hasErrors).toBe(false);
    expect(norm.coalT).toBe(1_500_000);
    expect(norm.equipmentL).toBe(70000 * 110);
    expect(norm.captureRate).toBe(0);
  });

  it('flags negative, missing and out-of-range inputs as errors', () => {
    const bad: RawInputs = {
      ...opencastRaw,
      diesel: { value: -5, unit: 'L' },
      coal: { value: null, unit: 'Mt' },
      captureRate: 120,
    };
    const v = validateInputs(bad);
    expect(v.hasErrors).toBe(true);
    const fields = v.issues.filter((i) => i.level === 'error').map((i) => i.field);
    expect(fields).toContain('diesel');
    expect(fields).toContain('coal');
    expect(fields).toContain('captureRate');
    expect(v.normalized.dieselL).toBe(0); // never NaN downstream
    expect(v.normalized.captureRate).toBe(1);
  });

  it('warns on implausible activity-per-tonne values', () => {
    const v = validateInputs({ ...opencastRaw, electricity: { value: 30, unit: 'TWh' } });
    expect(v.hasErrors).toBe(true); // unknown unit
    const w = validateInputs({ ...opencastRaw, diesel: { value: 120, unit: 'ML' } });
    expect(w.issues.some((i) => i.level === 'warning' && i.field === 'diesel')).toBe(true);
  });
});

describe('emission formulas (known values)', () => {
  it('diesel: 1,000 L × 2.68 kg/L = 2.68 t', () => {
    expect(dieselEmissions(1000, 2.68)).toBeCloseTo(2.68, 10);
  });
  it('electricity: 1,000,000 kWh × 0.82 t/MWh = 820 t', () => {
    expect(electricityEmissions(1_000_000, 0.82)).toBeCloseTo(820, 10);
  });
  it('explosives: 1,000 kg × 0.17 kg/kg = 0.17 t', () => {
    expect(explosivesEmissions(1000, 0.17)).toBeCloseTo(0.17, 10);
  });
  it('methane: 1,000 t coal × 10 kg/t = 10 tCH4 × GWP 28 = 280 tCO2e', () => {
    expect(methaneEmissions(1000, 10, 28)).toBeCloseTo(280, 10);
  });
  it('zero activity gives zero emissions', () => {
    const z = setup({
      ...undergroundRaw,
      coal: { value: 0, unit: 't' },
      diesel: { value: 0, unit: 'L' },
      equipmentHours: 0,
      electricity: { value: 0, unit: 'kWh' },
      explosives: { value: 0, unit: 'kg' },
    });
    const lines = computeInventory(z.norm, z.params, A);
    expect(inventoryTotals(lines).gross).toBe(0);
  });
});

describe('methane capture adjustment', () => {
  it('fraction = ramp × capture rate × destruction efficiency', () => {
    expect(capturedFraction(true, 1, 0.5, 0.98)).toBeCloseTo(0.49, 10);
    expect(capturedFraction(true, 0.5, 0.5, 0.98)).toBeCloseTo(0.245, 10);
  });
  it('is zero when capture is unavailable', () => {
    expect(capturedFraction(false, 1, 0.9, 0.98)).toBe(0);
  });
  it('280 tCO2e with 49% captured leaves 142.8 tCO2e', () => {
    expect(methaneAfterCapture(280, 0.49)).toBeCloseTo(142.8, 10);
  });
  it('turning capture on never raises emissions', () => {
    const { norm, params, costs } = setup(undergroundRaw);
    const base = simulateScenario(norm, baselineScenario, params, costs, OPTS);
    const withCap = simulateScenario(
      norm,
      { ...baselineScenario, levers: { ...baselineScenario.levers, capture: { ...baselineScenario.levers.capture, enabled: true } } },
      params,
      costs,
      OPTS,
    );
    base.rows.forEach((r, i) => expect(withCap.rows[i].gross).toBeLessThanOrEqual(r.gross + 1e-9));
    expect(withCap.rows[OPTS.horizonEnd - OPTS.baseYear].sources.methane).toBeLessThan(
      base.rows[OPTS.horizonEnd - OPTS.baseYear].sources.methane,
    );
  });
});

describe('sink growth curve', () => {
  it('Chapman–Richards stock: Cmax=100, k=0.1, p=1, age 10 → 63.2121', () => {
    expect(carbonStock(10, 100, 0.1, 1)).toBeCloseTo(100 * (1 - Math.exp(-1)), 8);
  });
  it('stock is 0 at age 0 and approaches Cmax', () => {
    expect(carbonStock(0, 250, 0.08, 2)).toBe(0);
    expect(carbonStock(500, 250, 0.08, 2)).toBeCloseTo(250, 3);
  });
  it('annual removals sum to the stock (no constant annual value)', () => {
    let sum = 0;
    for (let a = 0; a < 10; a++) sum += annualRemovalPerHa(a, 250, 0.08, 2);
    expect(sum).toBeCloseTo(carbonStock(10, 250, 0.08, 2), 8);
    expect(annualRemovalPerHa(0, 250, 0.08, 2)).toBeLessThan(annualRemovalPerHa(8, 250, 0.08, 2));
  });
  it('more planted area never delays neutrality (removals increase)', () => {
    const { norm, params, costs } = setup(opencastRaw);
    const mk = (ha: number): Scenario => ({
      ...baselineScenario,
      levers: { ...baselineScenario.levers, afforestation: { enabled: true, startYear: 2026, rampYear: 2030, adoption: 100, additionalHa: ha } },
    });
    const small = simulateScenario(norm, mk(100), params, costs, OPTS);
    const large = simulateScenario(norm, mk(1000), params, costs, OPTS);
    expect(large.totals.removals).toBeGreaterThan(small.totals.removals);
  });
});

describe('ramp', () => {
  it('starts in the start year and reaches 1 in the ramp-up year', () => {
    expect(ramp(2025, 2027, 2030)).toBe(0);
    expect(ramp(2027, 2027, 2030)).toBeCloseTo(0.25, 10);
    expect(ramp(2030, 2027, 2030)).toBe(1);
    expect(ramp(2040, 2027, 2030)).toBe(1);
    expect(ramp(2027, 2027, 2027)).toBe(1);
  });
});

describe('scenario totals and neutrality year', () => {
  it('baseline-year gross with no levers equals the inventory total', () => {
    const { norm, params, costs, ranges } = setup(underground());
    const inv = inventoryTotals(computeInventory(norm, params, A, ranges));
    const sim = simulateScenario(norm, baselineScenario, params, costs, OPTS);
    expect(sim.rows[0].gross).toBeCloseTo(inv.gross, 6);
    expect(sim.rows[0].scope1 + sim.rows[0].scope2).toBeCloseTo(inv.scope1 + inv.scope2, 6);
  });

  it('cumulative totals equal the sum of annual rows', () => {
    const { norm, params, costs } = setup(undergroundRaw);
    const r = simulateScenario(norm, balanced, params, costs, OPTS);
    const sum = (f: (x: (typeof r.rows)[number]) => number) => r.rows.reduce((s, x) => s + f(x), 0);
    expect(r.totals.gross).toBeCloseTo(sum((x) => x.gross), 6);
    expect(r.totals.removals).toBeCloseTo(sum((x) => x.removals), 6);
    expect(r.totals.net).toBeCloseTo(sum((x) => x.net), 6);
    expect(r.rows[r.rows.length - 1].cumNet).toBeCloseTo(r.totals.net, 6);
    expect(r.rows.length).toBe(16);
  });

  it('gross emissions are never reduced by removals or credits', () => {
    const { norm, params, costs } = setup(undergroundRaw);
    const withCredits: Scenario = {
      ...baselineScenario,
      levers: { ...baselineScenario.levers, credits: { enabled: true, startYear: 2025, rampYear: 2025, adoption: 100, volume: 1e9 } },
    };
    const a = simulateScenario(norm, baselineScenario, params, costs, OPTS);
    const b = simulateScenario(norm, withCredits, params, costs, OPTS);
    a.rows.forEach((r, i) => expect(b.rows[i].gross).toBeCloseTo(r.gross, 9));
    expect(b.rows[0].credits).toBe(1e9);
    expect(b.rows[0].net).toBeLessThan(0);
  });

  it('neutrality year: first year with net ≤ 0, null if never', () => {
    expect(firstNeutralYear([{ year: 2030, net: 5 }, { year: 2031, net: 0 }, { year: 2032, net: -3 }])).toBe(2031);
    expect(firstNeutralYear([{ year: 2030, net: 5 }, { year: 2031, net: 1 }])).toBeNull();
    const { norm, params, costs } = setup(undergroundRaw);
    expect(simulateScenario(norm, baselineScenario, params, costs, OPTS).neutralityYear).toBeNull();
    const huge: Scenario = {
      ...baselineScenario,
      levers: { ...baselineScenario.levers, credits: { enabled: true, startYear: 2031, rampYear: 2031, adoption: 100, volume: 1e9 } },
    };
    const r = simulateScenario(norm, huge, params, costs, OPTS);
    expect(r.neutralityYear).toBe(2031);
    expect(r.neutralityYearExCredits).toBeNull(); // credits do not count as reductions
  });

  it('fleet electrification cuts diesel but raises Scope 2 demand', () => {
    const { norm, params, costs } = setup(opencastRaw);
    const ev: Scenario = {
      ...baselineScenario,
      levers: { ...baselineScenario.levers, ev: { enabled: true, startYear: 2025, rampYear: 2025, adoption: 100 } },
    };
    const base = simulateScenario(norm, baselineScenario, params, costs, OPTS).rows[0];
    const r = simulateScenario(norm, ev, params, costs, OPTS).rows[0];
    expect(r.sources.diesel).toBeLessThan(base.sources.diesel);
    expect(r.sources.electricity).toBeGreaterThan(base.sources.electricity);
  });

  it('production growth scales activity-driven emissions', () => {
    const g = setup({ ...opencastRaw, productionGrowthPct: 10 });
    const r = simulateScenario(g.norm, baselineScenario, g.params, g.costs, OPTS);
    expect(r.rows[1].sources.diesel / r.rows[0].sources.diesel).toBeCloseTo(1.1, 9);
  });
});

describe('sample mines and validation band', () => {
  it('open-cast and underground produce different inventories', () => {
    const o = setup(opencastRaw);
    const u = setup(undergroundRaw);
    const ot = inventoryTotals(computeInventory(o.norm, o.params, A));
    const ut = inventoryTotals(computeInventory(u.norm, u.params, A));
    expect(ot.gross).not.toBeCloseTo(ut.gross, 0);
    const uMethane = computeInventory(u.norm, u.params, A).find((l) => l.id === 'methane')!.tCO2e;
    expect(uMethane / ut.gross).toBeGreaterThan(0.6); // underground is methane-dominated
  });

  it('both sample mines fall inside the 0.1–0.5 tCO2e/t brief range', () => {
    const lo = A.factors.find((f) => f.id === 'sanity_low')!.value;
    const hi = A.factors.find((f) => f.id === 'sanity_high')!.value;
    [opencastRaw, undergroundRaw].forEach((raw) => {
      const s = setup(raw);
      const i = intensityPerTonne(inventoryTotals(computeInventory(s.norm, s.params, A)).gross, s.norm.coalT);
      expect(i).toBeGreaterThanOrEqual(lo);
      expect(i).toBeLessThanOrEqual(hi);
    });
  });

  it('a measured methane override changes the methane line', () => {
    const base = setup(undergroundRaw);
    const over = setup({ ...undergroundRaw, methaneOverride: 6 });
    const m = (s: ReturnType<typeof setup>) => computeInventory(s.norm, s.params, A).find((l) => l.id === 'methane')!.tCO2e;
    expect(m(over)).toBeCloseTo((m(base) * 6) / 13.7, 4);
  });
});

describe('MAC ranking and waterfall', () => {
  it('ranks levers ascending by cost per tonne and abates positive tonnes', () => {
    const { norm, params, costs } = setup(undergroundRaw);
    const mac = computeMac(norm, balanced, params, costs, OPTS);
    expect(mac.length).toBe(5);
    const withVals = mac.filter((m) => m.macPerT !== null).map((m) => m.macPerT as number);
    expect([...withVals].sort((a, b) => a - b)).toEqual(withVals);
    const capture = mac.find((m) => m.lever === 'capture')!;
    expect(capture.abatedT).toBeGreaterThan(0);
  });

  it('waterfall steps reconcile to net emissions', () => {
    const { norm, params, costs } = setup(undergroundRaw);
    const steps = computeWaterfall(norm, balanced, params, costs, OPTS, 2040);
    const net = steps[steps.length - 1].value;
    const baseline = steps[0].value;
    const deltas = steps.filter((s) => s.kind === 'delta').reduce((s, x) => s + x.value, 0);
    expect(baseline + deltas).toBeCloseTo(net, 4);
    const r = simulateScenario(norm, balanced, params, costs, OPTS).rows[15];
    expect(net).toBeCloseTo(r.net, 4);
  });
});

describe('Monte Carlo', () => {
  const spread1 = { factors: 1, methane: 1, sinks: 1 };

  it('is reproducible with a fixed seed', () => {
    const { norm, ranges, costs } = setup(undergroundRaw);
    const a = runMonteCarlo(norm, balanced, ranges, costs, OPTS, { iterations: 300, seed: 7, spread: spread1 });
    const b = runMonteCarlo(norm, balanced, ranges, costs, OPTS, { iterations: 300, seed: 7, spread: spread1 });
    expect(a.p10).toBe(b.p10);
    expect(a.p50).toBe(b.p50);
    expect(a.p90).toBe(b.p90);
    expect(a.cumNetBand[15].p50).toBe(b.cumNetBand[15].p50);
  });

  it('zero-width ranges collapse to the deterministic answer', () => {
    const { norm, ranges, costs } = setup(undergroundRaw);
    const r = runMonteCarlo(norm, balanced, ranges, costs, OPTS, {
      iterations: 100,
      seed: 1,
      spread: { factors: 0, methane: 0, sinks: 0 },
    });
    expect(r.p10).toBe(r.deterministicYear);
    expect(r.p50).toBe(r.deterministicYear);
    expect(r.p90).toBe(r.deterministicYear);
    expect(r.cumNetBand[15].p10).toBeCloseTo(r.cumNetBand[15].p90, 6);
  });

  it('widening uncertainty widens the cumulative-net band', () => {
    const { norm, ranges, costs } = setup(undergroundRaw);
    const narrow = runMonteCarlo(norm, balanced, ranges, costs, OPTS, { iterations: 400, seed: 3, spread: { factors: 0.3, methane: 0.3, sinks: 0.3 } });
    const wide = runMonteCarlo(norm, balanced, ranges, costs, OPTS, { iterations: 400, seed: 3, spread: { factors: 2, methane: 2, sinks: 2 } });
    const w = (m: typeof narrow) => m.cumNetBand[15].p90 - m.cumNetBand[15].p10;
    expect(w(wide)).toBeGreaterThan(w(narrow));
  });

  it('percentile handles "not reached" (Infinity) correctly', () => {
    const sorted = [2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, Infinity, Infinity];
    expect(percentile(sorted, 0.1)).toBe(2030);
    expect(percentile(sorted, 0.5)).toBe(2034);
    expect(percentile(sorted, 0.9)).toBe(Infinity);
  });

  it('PRNG is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('a disabled-lever scenario matches the baseline simulation', () => {
    const { norm, params, costs } = setup(undergroundRaw);
    const a = simulateScenario(norm, disableAll(balanced), params, costs, OPTS);
    const b = simulateScenario(norm, baselineScenario, params, costs, OPTS);
    expect(a.totals.net).toBeCloseTo(b.totals.net, 6);
  });
});

describe('sink envelope and recommendation', () => {
  it('envelope brackets the central removal estimate', () => {
    const { norm, ranges, costs } = setup(undergroundRaw);
    const env = sinkEnvelope(norm, balanced, ranges, costs, OPTS, { factors: 1, methane: 1, sinks: 1 });
    env.forEach((e) => {
      expect(e.low).toBeLessThanOrEqual(e.central + 1e-9);
      expect(e.high).toBeGreaterThanOrEqual(e.central - 1e-9);
    });
    expect(env[15].high).toBeGreaterThan(env[15].low);
  });

  it('recommendation orders enabled levers by ascending MAC and states Scope 3 status', () => {
    const { norm, params, ranges, costs } = setup(undergroundRaw);
    const result = simulateScenario(norm, balanced, params, costs, OPTS);
    const mac = computeMac(norm, balanced, params, costs, OPTS);
    const mc = runMonteCarlo(norm, balanced, ranges, costs, OPTS, { iterations: 200, seed: 5, spread: { factors: 1, methane: 1, sinks: 1 } });
    const rec = buildRecommendation({
      scenario: balanced, result, mac, mc, includeScope3: false, scope3T: 0,
      demoAssumptionCount: 29, totalAssumptionCount: 29, baseYear: 2025, horizonEnd: 2040,
      mineLabel: 'test mine', captureAvailable: true,
    });
    const order = rec.levers.map((l) => mac.findIndex((m) => m.lever === l.lever));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(rec.scope3Line).toContain('not included');
    expect(rec.disclaimer).toContain('not professional engineering');
    expect(rangeText(mc, 2040)).toMatch(/to/);
  });
});

function underground() {
  return undergroundRaw;
}

import { runSensitivity, creditDependence, findPlans, paramSetFromModes } from './index';

describe('analysis: sensitivity, credit dependence, plan finder', () => {
  const s = setup(undergroundRaw);
  const ranges = resolveRanges(A, s.norm);
  const opts = { baseYear: A.baseYear, horizonEnd: A.horizonEnd };
  const scen = (samples.underground.scenarios as unknown as Scenario[])[2];

  it('sensitivity is sorted by swing and methane intensity dominates an underground mine', () => {
    const r = runSensitivity(s.norm, scen, ranges, s.costs, opts);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i - 1].swing).toBeGreaterThanOrEqual(r.rows[i].swing);
    expect(r.rows[0].key).toBe('ch4Intensity');
    expect(r.rows[0].cumNetLow).toBeLessThan(r.centralCumNet);
    expect(r.rows[0].cumNetHigh).toBeGreaterThan(r.centralCumNet);
  });

  it('credit dependence shares reconcile to 1', () => {
    const p = paramSetFromModes(ranges);
    const res = simulateScenario(s.norm, scen, p, s.costs, opts);
    const base = simulateScenario(s.norm, (samples.underground.scenarios as unknown as Scenario[])[0], p, s.costs, opts);
    const d = creditDependence(res, base, 2035);
    expect(d.shareReductions + d.shareRemovals + d.shareCredits + d.shareUnclosed).toBeCloseTo(1, 9);
  });

  it('plan finder returns plans that reach net zero by the target, cheapest first, under the credit cap', () => {
    const p = paramSetFromModes(ranges);
    const f = findPlans(s.norm, scen, p, s.costs, opts, { targetYear: 2038, maxCreditShare: 1, captureAvailable: true });
    expect(f.feasible).toBeGreaterThan(0);
    for (let i = 1; i < f.plans.length; i++) expect(f.plans[i - 1].costPV).toBeLessThanOrEqual(f.plans[i].costPV);
    f.plans.forEach((pl) => {
      expect(pl.result.neutralityYear!).toBeLessThanOrEqual(2038);
      expect(pl.creditShare).toBeLessThanOrEqual(1 + 1e-9);
    });
  });

  it('plan finder reports infeasibility instead of faking a plan', () => {
    const p = paramSetFromModes(ranges);
    const f = findPlans(s.norm, scen, p, s.costs, opts, { targetYear: 2030, maxCreditShare: 0, captureAvailable: true });
    expect(f.plans.length).toBe(0);
    expect(f.infeasibleReason).toBeTruthy();
  });
});
