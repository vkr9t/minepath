import type { Assumptions, InventoryLine, NormalizedInputs, ParamRanges, ParamSet } from './types';
import { getFactor, methaneFactorId } from './params';

// ---- Pure formulas (single place each; used by inventory and by the simulator) ----

/** kg/L × L → tCO2e */
export function dieselEmissions(litres: number, efKgPerL: number): number {
  return (litres * efKgPerL) / 1000;
}

/** kWh × (tCO2e/MWh) → tCO2e */
export function electricityEmissions(kWh: number, efTPerMWh: number): number {
  return (kWh / 1000) * efTPerMWh;
}

/** kg × kgCO2e/kg → tCO2e */
export function explosivesEmissions(kg: number, efKgPerKg: number): number {
  return (kg * efKgPerKg) / 1000;
}

/** t coal × kg CH4/t → t CH4 */
export function methaneMassT(coalT: number, intensityKgPerT: number): number {
  return (coalT * intensityKgPerT) / 1000;
}

/** Gross fugitive methane in tCO2e, before any capture. */
export function methaneEmissions(coalT: number, intensityKgPerT: number, gwp: number): number {
  return methaneMassT(coalT, intensityKgPerT) * gwp;
}

/**
 * Fraction of fugitive methane destroyed by capture:
 * available × lever ramp × capture rate × destruction efficiency.
 */
export function capturedFraction(
  available: boolean,
  leverEffect: number, // 0..1 (ramp × adoption)
  captureRate: number, // 0..1
  destruction: number, // 0..1
): number {
  if (!available) return 0;
  return clamp01(leverEffect) * clamp01(captureRate) * clamp01(destruction);
}

/** Apply the capture fraction to gross methane. */
export function methaneAfterCapture(grossTCO2e: number, fraction: number): number {
  return grossTCO2e * (1 - clamp01(fraction));
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// ---- Baseline inventory (base year, no levers) with full audit trail ----

export function computeInventory(
  norm: NormalizedInputs,
  params: ParamSet,
  a: Assumptions,
  ranges?: ParamRanges,
): InventoryLine[] {
  const sourceOf = (id: string) => {
    const f = getFactor(a, id);
    return { status: f.status, sourceName: f.sourceName };
  };
  const r = ranges;
  const lo = <K extends keyof ParamSet>(k: K): number => (r ? r[k].low : params[k]);
  const hi = <K extends keyof ParamSet>(k: K): number => (r ? r[k].high : params[k]);

  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumSignificantDigits: 6 });

  const diesel = dieselEmissions(norm.dieselL, params.efDiesel);
  const equip = dieselEmissions(norm.equipmentL, params.efDiesel);
  const elec = electricityEmissions(norm.electricityKWh, params.efGrid);
  const expl = explosivesEmissions(norm.explosivesKg, params.efExplosives);
  const ch4t = methaneMassT(norm.coalT, params.ch4Intensity);
  const ch4 = ch4t * params.gwp;

  const ch4FactorId = methaneFactorId(norm.mineType);
  const ch4Src = sourceOf(ch4FactorId);
  const overridden = norm.methaneOverride !== null;

  const lines: InventoryLine[] = [
    {
      id: 'diesel',
      label: 'Diesel combustion (excavation & haulage)',
      scope: 1,
      activityLabel: 'Diesel used',
      activityValue: norm.dieselL,
      activityUnit: 'L/yr',
      factorLabel: 'Diesel emission factor',
      factorValue: params.efDiesel,
      factorUnit: 'kgCO2e/L',
      factorId: 'ef_diesel',
      formula: `${fmt(norm.dieselL)} L × ${fmt(params.efDiesel)} kgCO2e/L ÷ 1000`,
      tCO2e: diesel,
      lowT: dieselEmissions(norm.dieselL, lo('efDiesel')),
      highT: dieselEmissions(norm.dieselL, hi('efDiesel')),
      ...sourceOf('ef_diesel'),
    },
    {
      id: 'equipment',
      label: 'Equipment fuel use',
      scope: 1,
      activityLabel: `Equipment diesel (${fmt(norm.equipmentHours)} h × ${fmt(norm.equipmentFuelRate)} L/h)`,
      activityValue: norm.equipmentL,
      activityUnit: 'L/yr',
      factorLabel: 'Diesel emission factor',
      factorValue: params.efDiesel,
      factorUnit: 'kgCO2e/L',
      factorId: 'ef_diesel',
      formula: `(${fmt(norm.equipmentHours)} h × ${fmt(norm.equipmentFuelRate)} L/h) × ${fmt(params.efDiesel)} kgCO2e/L ÷ 1000`,
      tCO2e: equip,
      lowT: dieselEmissions(norm.equipmentL, lo('efDiesel')),
      highT: dieselEmissions(norm.equipmentL, hi('efDiesel')),
      ...sourceOf('ef_diesel'),
    },
    {
      id: 'electricity',
      label: 'Purchased electricity',
      scope: 2,
      activityLabel: 'Electricity purchased',
      activityValue: norm.electricityKWh,
      activityUnit: 'kWh/yr',
      factorLabel: 'Grid emission factor (location-based)',
      factorValue: params.efGrid,
      factorUnit: 'tCO2e/MWh',
      factorId: 'ef_grid',
      formula: `${fmt(norm.electricityKWh)} kWh ÷ 1000 × ${fmt(params.efGrid)} tCO2e/MWh`,
      tCO2e: elec,
      lowT: electricityEmissions(norm.electricityKWh, lo('efGrid')),
      highT: electricityEmissions(norm.electricityKWh, hi('efGrid')),
      ...sourceOf('ef_grid'),
    },
    {
      id: 'methane',
      label: `Fugitive methane (${norm.mineType === 'underground' ? 'underground' : 'open-cast'})`,
      scope: 1,
      activityLabel: 'Coal produced',
      activityValue: norm.coalT,
      activityUnit: 't/yr',
      factorLabel: overridden
        ? 'Methane intensity (user-supplied override) × GWP'
        : 'Methane intensity × GWP',
      factorValue: params.ch4Intensity * params.gwp,
      factorUnit: 'kgCO2e/t coal',
      factorId: overridden ? ch4FactorId : ch4FactorId,
      formula: `${fmt(norm.coalT)} t × ${fmt(params.ch4Intensity)} kg CH4/t ÷ 1000 = ${fmt(ch4t)} t CH4; × GWP ${fmt(params.gwp)} tCO2e/tCH4`,
      tCO2e: ch4,
      lowT: methaneEmissions(norm.coalT, lo('ch4Intensity'), lo('gwp')),
      highT: methaneEmissions(norm.coalT, hi('ch4Intensity'), hi('gwp')),
      status: overridden ? 'demo_assumption' : ch4Src.status,
      sourceName: overridden
        ? 'User-supplied intensity override (unverified by this app); GWP from assumptions file'
        : ch4Src.sourceName,
    },
    {
      id: 'explosives',
      label: 'Explosives',
      scope: 1,
      activityLabel: 'Explosives used',
      activityValue: norm.explosivesKg,
      activityUnit: 'kg/yr',
      factorLabel: 'Explosives emission factor',
      factorValue: params.efExplosives,
      factorUnit: 'kgCO2e/kg',
      factorId: 'ef_explosives',
      formula: `${fmt(norm.explosivesKg)} kg × ${fmt(params.efExplosives)} kgCO2e/kg ÷ 1000`,
      tCO2e: expl,
      lowT: explosivesEmissions(norm.explosivesKg, lo('efExplosives')),
      highT: explosivesEmissions(norm.explosivesKg, hi('efExplosives')),
      ...sourceOf('ef_explosives'),
    },
  ];
  return lines;
}

export function inventoryTotals(lines: InventoryLine[]) {
  const scope1 = lines.filter((l) => l.scope === 1).reduce((s, l) => s + l.tCO2e, 0);
  const scope2 = lines.filter((l) => l.scope === 2).reduce((s, l) => s + l.tCO2e, 0);
  const low = lines.reduce((s, l) => s + l.lowT, 0);
  const high = lines.reduce((s, l) => s + l.highT, 0);
  return { scope1, scope2, gross: scope1 + scope2, low, high };
}

/** Scope 3 memo item: downstream combustion of sold coal. Never added to the inventory. */
export function scope3Memo(norm: NormalizedInputs, params: ParamSet): number {
  return norm.coalT * params.scope3Ef;
}

/** Scope 1+2 tCO2e per tonne of coal. */
export function intensityPerTonne(grossT: number, coalT: number): number {
  return coalT > 0 ? grossT / coalT : 0;
}
