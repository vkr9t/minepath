import type {
  CostSet,
  LeverKey,
  LeverSetting,
  NormalizedInputs,
  ParamSet,
  Scenario,
  ScenarioResult,
  SourceKey,
  YearRow,
} from './types';
import {
  capturedFraction,
  dieselEmissions,
  electricityEmissions,
  explosivesEmissions,
  methaneAfterCapture,
  methaneEmissions,
} from './emissions';
import { cohortRemoval } from './sinks';

export const LEVER_KEYS: LeverKey[] = ['ev', 'capture', 'ppa', 'afforestation', 'credits'];

export const LEVER_LABELS: Record<LeverKey, string> = {
  ev: 'Fleet electrification',
  capture: 'Methane capture',
  ppa: 'Renewable electricity (PPA)',
  afforestation: 'Afforestation / reclamation',
  credits: 'Carbon credits (offset)',
};

export interface SimOptions {
  baseYear: number;
  horizonEnd: number;
}

/**
 * Share (0..1) of a lever's full ramp reached in `year`.
 * The effect starts in the start year and reaches 100% in the ramp-up year, linearly.
 * If rampYear ≤ startYear the lever switches on fully in its start year.
 */
export function ramp(year: number, startYear: number, rampYear: number): number {
  if (year < startYear) return 0;
  const steps = Math.max(1, rampYear - startYear + 1);
  return Math.min(1, (year - startYear + 1) / steps);
}

/** Ramp share ignoring adoption level, zero if the lever is disabled. */
function rampOf(l: LeverSetting, year: number): number {
  return l.enabled ? ramp(year, l.startYear, l.rampYear) : 0;
}

/** Effective lever effect = ramp × adoption level (0..1). Zero if disabled. */
export function leverEffect(l: LeverSetting, year: number): number {
  return rampOf(l, year) * Math.min(100, Math.max(0, l.adoption)) / 100;
}

export function disableAll(s: Scenario): Scenario {
  const levers = { ...s.levers };
  LEVER_KEYS.forEach((k) => {
    levers[k] = { ...levers[k], enabled: false };
  });
  return { ...s, levers };
}

export function onlyLever(s: Scenario, key: LeverKey): Scenario {
  const base = disableAll(s);
  return { ...base, levers: { ...base.levers, [key]: { ...s.levers[key], enabled: true } } };
}

export function firstNeutralYear(rows: { year: number; net: number }[]): number | null {
  const hit = rows.find((r) => r.net <= 1e-6);
  return hit ? hit.year : null;
}

export function simulateScenario(
  norm: NormalizedInputs,
  scenario: Scenario,
  params: ParamSet,
  costs: CostSet,
  opts: SimOptions,
): ScenarioResult {
  const { baseYear, horizonEnd } = opts;
  const L = scenario.levers;
  const nYears = horizonEnd - baseYear + 1;

  // Capacity sizing on base-year activity (documented simplification).
  const baseDieselL = norm.dieselL + norm.equipmentL;
  const evAdoption = Math.min(100, Math.max(0, L.ev.adoption)) / 100;
  const evTargetL = baseDieselL * params.evMaxShare * evAdoption;
  const baseCh4 = methaneEmissions(norm.coalT, params.ch4Intensity, params.gwp);
  const capAdoption = Math.min(100, Math.max(0, L.capture.adoption)) / 100;
  const captureCapacityT = norm.captureAvailable ? baseCh4 * norm.captureRate * params.destruction * capAdoption : 0;

  // Afforestation planting schedule (ha per year) from ramp increments.
  const totalNewHa = L.afforestation.enabled
    ? Math.max(0, L.afforestation.additionalHa ?? 0) * Math.min(100, Math.max(0, L.afforestation.adoption)) / 100
    : 0;
  const planted: number[] = [];
  for (let i = 0; i < nYears; i++) {
    const y = baseYear + i;
    planted.push(totalNewHa * (rampOf(L.afforestation, y) - rampOf(L.afforestation, y - 1)));
  }

  const rows: YearRow[] = [];
  let cumGross = 0, cumRemovals = 0, cumCredits = 0, cumNet = 0, cumNetEx = 0, cumPlanted = 0;
  let costNominal = 0, costPV = 0;

  for (let i = 0; i < nYears; i++) {
    const year = baseYear + i;
    const g = Math.pow(1 + norm.productionGrowth, i);
    const gridEf = params.efGrid * Math.pow(1 - params.gridDecline, i);

    // --- Fleet electrification: shifts diesel to electricity ---
    const evEff = leverEffect(L.ev, year);
    const share = Math.min(1, evEff * params.evMaxShare);
    const haulL = norm.dieselL * g;
    const equipL = norm.equipmentL * g;
    const displacedL = (haulL + equipL) * share;
    const evAddedKWh = displacedL * params.evKwhPerL;

    const dieselT = dieselEmissions(haulL * (1 - share), params.efDiesel);
    const equipT = dieselEmissions(equipL * (1 - share), params.efDiesel);

    // --- Electricity (Scope 2), reduced by PPA share ---
    const ppaShare = leverEffect(L.ppa, year);
    const elecKWh = norm.electricityKWh * g + evAddedKWh;
    const elecT = electricityEmissions(elecKWh, gridEf) * (1 - ppaShare);

    // --- Methane with capture ---
    const ch4Gross = methaneEmissions(norm.coalT * g, params.ch4Intensity, params.gwp);
    const frac = capturedFraction(norm.captureAvailable, leverEffect(L.capture, year), norm.captureRate, params.destruction);
    const ch4T = methaneAfterCapture(ch4Gross, frac);
    const ch4Destroyed = ch4Gross - ch4T;

    const explT = explosivesEmissions(norm.explosivesKg * g, params.efExplosives);

    const sources: Record<SourceKey, number> = {
      diesel: dieselT,
      equipment: equipT,
      electricity: elecT,
      methane: ch4T,
      explosives: explT,
    };
    const scope1 = dieselT + equipT + ch4T + explT;
    const scope2 = elecT;
    const gross = scope1 + scope2;

    // --- Removals (estimated) ---
    const forestExisting = cohortRemoval(norm.reclaimedHa, norm.plantationAge + i, params.survival, params.cmax, params.k, params.p);
    let forestNew = 0;
    for (let c = 0; c <= i; c++) {
      if (planted[c] > 0) forestNew += cohortRemoval(planted[c], i - c, params.survival, params.cmax, params.k, params.p);
    }
    const forest = forestExisting + forestNew;
    const soil = norm.includeSoil ? norm.soilCarbonT * params.soilMult : 0;
    const removals = forest + soil;

    // --- Credits (offsets, kept separate) ---
    const credits = L.credits.enabled ? Math.max(0, L.credits.volume ?? 0) * leverEffect(L.credits, year) : 0;

    // --- Costs (INR; negative = net saving) ---
    const evRamp = rampOf(L.ev, year);
    const evRampPrev = rampOf(L.ev, year - 1);
    const evCapex = costs.evCapexPerLitre * evTargetL * (evRamp - evRampPrev);
    const evInstalled = costs.evCapexPerLitre * evTargetL * evRamp;
    const evOpex = costs.evOpexFraction * evInstalled;
    const evSaving = displacedL * (costs.priceDiesel - params.evKwhPerL * costs.priceElectricity);
    const capRamp = rampOf(L.capture, year);
    const capRampPrev = rampOf(L.capture, year - 1);
    const capCapex = costs.captureCapex * captureCapacityT * (capRamp - capRampPrev);
    const capOpex = costs.captureOpex * ch4Destroyed;
    cumPlanted += planted[i];
    const costRec: Record<LeverKey, number> = {
      ev: evCapex + evOpex - evSaving,
      capture: capCapex + capOpex,
      ppa: costs.ppaPremium * elecKWh * ppaShare,
      afforestation: costs.affCapex * planted[i] + costs.affOpex * cumPlanted,
      credits: costs.creditPrice * credits,
    };
    const costTotal = LEVER_KEYS.reduce((s, k) => s + costRec[k], 0);
    costNominal += costTotal;
    costPV += costTotal / Math.pow(1 + costs.discountRate, i);

    const net = gross - removals - credits;
    const netEx = gross - removals;
    cumGross += gross;
    cumRemovals += removals;
    cumCredits += credits;
    cumNet += net;
    cumNetEx += netEx;

    rows.push({
      year,
      sources,
      scope1,
      scope2,
      gross,
      forestExisting,
      forestNew,
      forestRemovals: forest,
      soilRemovals: soil,
      removals,
      credits,
      net,
      netExCredits: netEx,
      costs: costRec,
      costTotal,
      cumGross,
      cumRemovals,
      cumCredits,
      cumNet,
      cumNetExCredits: cumNetEx,
    });
  }

  return {
    scenarioId: scenario.id,
    rows,
    neutralityYear: firstNeutralYear(rows),
    neutralityYearExCredits: firstNeutralYear(rows.map((r) => ({ year: r.year, net: r.netExCredits }))),
    totals: { gross: cumGross, removals: cumRemovals, credits: cumCredits, net: cumNet, costNominal, costPV },
  };
}
