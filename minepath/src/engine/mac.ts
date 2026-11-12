import type { CostSet, LeverKey, MacEntry, NormalizedInputs, ParamSet, Scenario, WaterfallStep } from './types';
import { disableAll, LEVER_KEYS, LEVER_LABELS, onlyLever, simulateScenario, type SimOptions } from './scenario';

/**
 * Marginal-abatement-cost ranking.
 * Each lever is evaluated ALONE (using the scenario's settings for it, even if currently
 * switched off) against a no-lever baseline:
 *   abated_y = baseline net_y − lever-only net_y            [tCO2e per year]
 *   cost     = Σ_years cost_y / (1 + r)^(y − base)          [INR, present value]
 *   abatedPV = Σ_years abated_y / (1 + r)^(y − base)        [tCO2e, discounted]
 *   MAC      = cost / abatedPV                               [INR per tCO2e, levelised]
 * Undiscounted cumulative abatement is also reported for readability.
 * Negative MAC means the lever saves money over the horizon. Interactions between levers are
 * not captured here (see waterfall for the combined, sequential view).
 */
export function computeMac(
  norm: NormalizedInputs,
  scenario: Scenario,
  params: ParamSet,
  costs: CostSet,
  opts: SimOptions,
): MacEntry[] {
  const base = simulateScenario(norm, disableAll(scenario), params, costs, opts);
  const out: MacEntry[] = LEVER_KEYS.map((lever) => {
    const r = simulateScenario(norm, onlyLever(scenario, lever), params, costs, opts);
    const abated = base.totals.net - r.totals.net;
    // Levelised: discount the abated tonnes at the same rate as the cost.
    let abatedPV = 0;
    r.rows.forEach((row, i) => {
      abatedPV += (base.rows[i].net - row.net) / Math.pow(1 + costs.discountRate, i);
    });
    return {
      lever,
      label: LEVER_LABELS[lever],
      abatedT: abated,
      abatedPVT: abatedPV,
      costPV: r.totals.costPV,
      costNominal: r.totals.costNominal,
      macPerT: abatedPV > 1e-6 ? r.totals.costPV / abatedPV : null,
    };
  });
  return out.sort((a, b) => {
    if (a.macPerT === null && b.macPerT === null) return 0;
    if (a.macPerT === null) return 1;
    if (b.macPerT === null) return -1;
    return a.macPerT - b.macPerT;
  });
}

/**
 * Gap-analysis waterfall for one year. Levers are applied sequentially in a fixed order
 * (electrification → methane capture → PPA) so interactions (extra grid demand from an
 * electric fleet, PPA cover of that demand) are attributed consistently.
 * Removals and credits are then shown as separate steps; gross emissions are never netted
 * inside the inventory.
 */
export function computeWaterfall(
  norm: NormalizedInputs,
  scenario: Scenario,
  params: ParamSet,
  costs: CostSet,
  opts: SimOptions,
  year: number,
): WaterfallStep[] {
  const idx = year - opts.baseYear;
  const grossAt = (s: Scenario) => simulateScenario(norm, s, params, costs, opts).rows[idx].gross;

  const s0 = disableAll(scenario);
  const withKeys = (keys: LeverKey[]): Scenario => {
    const s = disableAll(scenario);
    keys.forEach((k) => {
      s.levers = { ...s.levers, [k]: { ...scenario.levers[k] } };
    });
    return s;
  };
  const g0 = grossAt(s0);
  const g1 = grossAt(withKeys(['ev']));
  const g2 = grossAt(withKeys(['ev', 'capture']));
  const g3 = grossAt(withKeys(['ev', 'capture', 'ppa']));
  const full = simulateScenario(norm, scenario, params, costs, opts).rows[idx];

  return [
    { label: `Baseline gross ${year}`, value: g0, kind: 'total' },
    { label: 'Fleet electrification', value: g1 - g0, kind: 'delta' },
    { label: 'Methane capture', value: g2 - g1, kind: 'delta' },
    { label: 'Renewable PPA', value: g3 - g2, kind: 'delta' },
    { label: 'Scenario gross', value: full.gross, kind: 'total' },
    { label: 'Removals (est.)', value: -full.removals, kind: 'delta' },
    { label: 'Credits (offset)', value: -full.credits, kind: 'delta' },
    { label: 'Net emissions', value: full.net, kind: 'total' },
  ];
}
