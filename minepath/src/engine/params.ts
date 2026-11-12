import type { Assumptions, CostSet, FactorRecord, NormalizedInputs, ParamKey, ParamRange, ParamRanges, ParamSet } from './types';

export function getFactor(a: Assumptions, id: string): FactorRecord {
  const f = a.factors.find((x) => x.id === id);
  if (!f) throw new Error(`Missing factor "${id}" in assumptions config`);
  return f;
}

function range(f: FactorRecord, scale = 1): ParamRange {
  const mode = f.value * scale;
  const low = (f.low ?? f.value) * scale;
  const high = (f.high ?? f.value) * scale;
  return { low: Math.min(low, mode), mode, high: Math.max(high, mode) };
}

/** Factor id that supplies the methane intensity for a mine type. */
export function methaneFactorId(mineType: NormalizedInputs['mineType']): string {
  return mineType === 'underground' ? 'ch4_intensity_underground' : 'ch4_intensity_opencast';
}

/**
 * Low / mode / high for every uncertain parameter, built from the assumptions file.
 * A measured methane intensity override replaces the central value; the factor's
 * relative low/high spread is kept around it.
 */
export function resolveRanges(a: Assumptions, norm: NormalizedInputs): ParamRanges {
  const ch4 = getFactor(a, methaneFactorId(norm.mineType));
  const ch4Scale = norm.methaneOverride !== null && ch4.value > 0 ? norm.methaneOverride / ch4.value : 1;
  return {
    efDiesel: range(getFactor(a, 'ef_diesel')),
    efGrid: range(getFactor(a, 'ef_grid')),
    efExplosives: range(getFactor(a, 'ef_explosives')),
    ch4Intensity: range(ch4, ch4Scale),
    gwp: range(getFactor(a, 'gwp_ch4')),
    destruction: range(getFactor(a, 'capture_destruction')),
    scope3Ef: range(getFactor(a, 'ef_scope3_coal')),
    gridDecline: range(getFactor(a, 'grid_decline'), 0.01),
    evKwhPerL: range(getFactor(a, 'ev_kwh_per_litre')),
    evMaxShare: range(getFactor(a, 'ev_max_share')),
    cmax: range(getFactor(a, 'sink_cmax')),
    k: range(getFactor(a, 'sink_k')),
    p: range(getFactor(a, 'sink_p')),
    survival: range(getFactor(a, 'sink_survival')),
    soilMult: range(getFactor(a, 'soil_mult')),
  };
}

/** Central (deterministic) parameter set = the mode of every range. */
export function resolveParams(a: Assumptions, norm: NormalizedInputs): ParamSet {
  const r = resolveRanges(a, norm);
  const out = {} as ParamSet;
  (Object.keys(r) as ParamKey[]).forEach((k) => {
    out[k] = r[k].mode;
  });
  return out;
}

export function resolveCosts(a: Assumptions): CostSet {
  const v = (id: string) => getFactor(a, id).value;
  return {
    priceDiesel: v('price_diesel'),
    priceElectricity: v('price_electricity'),
    evCapexPerLitre: v('ev_capex_per_litre'),
    evOpexFraction: v('ev_opex_fraction'),
    captureCapex: v('capture_capex'),
    captureOpex: v('capture_opex'),
    ppaPremium: v('ppa_premium'),
    affCapex: v('aff_capex'),
    affOpex: v('aff_opex'),
    creditPrice: v('credit_price'),
    discountRate: v('discount_rate'),
  };
}
