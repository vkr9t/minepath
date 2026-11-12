// Shared types for the pure calculation engine. No UI imports allowed here.

export type MineType = 'opencast' | 'underground';
export type FactorStatus = 'verified' | 'demo_assumption';

export interface Quantity {
  value: number | null;
  unit: string;
}

/** Raw (as typed by the user) mine inputs. Values may be null/invalid. */
export interface RawInputs {
  name: string;
  mineType: MineType;
  coal: Quantity; // t | kt | Mt per year
  diesel: Quantity; // L | kL | ML per year (excavation + haulage)
  equipmentHours: number | null; // h/yr
  equipmentFuelRate: number | null; // L/h
  electricity: Quantity; // kWh | MWh | GWh per year
  explosives: Quantity; // kg | t per year
  methaneOverride: number | null; // kg CH4 / t coal, optional measured value
  captureAvailable: boolean;
  captureRate: number | null; // % of fugitive methane the system can capture at full adoption
  reclaimedHa: number | null;
  plantationAge: number | null; // years since planting of existing plantation
  soilCarbon: number | null; // tCO2e/yr, optional estimate
  includeSoil: boolean;
  productionGrowthPct: number | null; // % per year change in activity
  includeScope3: boolean;
}

/** Inputs after validation and unit normalisation (SI-ish base units). */
export interface NormalizedInputs {
  mineType: MineType;
  coalT: number; // t/yr
  dieselL: number; // L/yr (excavation + haulage)
  equipmentHours: number;
  equipmentFuelRate: number; // L/h
  equipmentL: number; // L/yr = hours × rate
  electricityKWh: number; // kWh/yr
  explosivesKg: number; // kg/yr
  methaneOverride: number | null; // kg CH4/t
  captureAvailable: boolean;
  captureRate: number; // fraction 0..1
  reclaimedHa: number;
  plantationAge: number;
  soilCarbonT: number; // tCO2e/yr
  includeSoil: boolean;
  productionGrowth: number; // fraction per year
  includeScope3: boolean;
}

export interface ValidationIssue {
  field: string;
  level: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  normalized: NormalizedInputs;
  issues: ValidationIssue[];
  hasErrors: boolean;
}

export interface FactorRecord {
  id: string;
  name: string;
  category: string;
  value: number;
  unit: string;
  low: number | null;
  high: number | null;
  sourceName: string;
  sourceUrl: string;
  year: number | null;
  notes: string;
  geography: string;
  status: FactorStatus;
}

export interface Assumptions {
  baseYear: number;
  horizonEnd: number;
  factors: FactorRecord[];
}

/** Flat set of numeric parameters used by one simulation run (central or sampled). */
export interface ParamSet {
  efDiesel: number; // kgCO2e/L
  efGrid: number; // tCO2e/MWh
  efExplosives: number; // kgCO2e/kg
  ch4Intensity: number; // kg CH4 / t coal
  gwp: number; // tCO2e/tCH4
  destruction: number; // fraction
  scope3Ef: number; // tCO2/t coal
  gridDecline: number; // fraction per year
  evKwhPerL: number;
  evMaxShare: number; // fraction
  cmax: number; // tCO2e/ha
  k: number;
  p: number;
  survival: number; // fraction
  soilMult: number;
}

export type ParamKey = keyof ParamSet;
export type ParamRange = { low: number; mode: number; high: number };
export type ParamRanges = Record<ParamKey, ParamRange>;

export interface CostSet {
  priceDiesel: number; // INR/L
  priceElectricity: number; // INR/kWh
  evCapexPerLitre: number; // INR per (L/yr)
  evOpexFraction: number; // fraction of capex per year
  captureCapex: number; // INR per (tCO2e/yr)
  captureOpex: number; // INR per tCO2e destroyed
  ppaPremium: number; // INR/kWh
  affCapex: number; // INR/ha
  affOpex: number; // INR/ha/yr
  creditPrice: number; // INR/tCO2e
  discountRate: number; // fraction
}

export type LeverKey = 'ev' | 'capture' | 'ppa' | 'afforestation' | 'credits';

export interface LeverSetting {
  enabled: boolean;
  startYear: number;
  rampYear: number; // year in which the lever reaches full (adoption-level) effect
  adoption: number; // 0..100 (% of the lever's maximum potential)
  additionalHa?: number; // afforestation: extra hectares planted at 100% adoption
  volume?: number; // credits: tCO2e/yr purchased at 100% adoption
}

export interface Scenario {
  id: string;
  name: string;
  locked: boolean;
  levers: Record<LeverKey, LeverSetting>;
}

export type SourceKey = 'diesel' | 'equipment' | 'electricity' | 'methane' | 'explosives';

export interface InventoryLine {
  id: SourceKey;
  label: string;
  scope: 1 | 2;
  activityLabel: string;
  activityValue: number;
  activityUnit: string;
  factorLabel: string;
  factorValue: number;
  factorUnit: string;
  factorId: string;
  formula: string;
  tCO2e: number;
  lowT: number;
  highT: number;
  status: FactorStatus;
  sourceName: string;
}

export interface YearRow {
  year: number;
  sources: Record<SourceKey, number>; // tCO2e after levers
  scope1: number;
  scope2: number;
  gross: number;
  forestExisting: number; // existing reclaimed/afforested area
  forestNew: number; // plantings added by the afforestation lever
  forestRemovals: number;
  soilRemovals: number;
  removals: number;
  credits: number;
  net: number; // gross − removals − credits
  netExCredits: number; // gross − removals
  costs: Record<LeverKey, number>; // INR, net of savings
  costTotal: number;
  cumGross: number;
  cumRemovals: number;
  cumCredits: number;
  cumNet: number;
  cumNetExCredits: number;
}

export interface ScenarioResult {
  scenarioId: string;
  rows: YearRow[];
  neutralityYear: number | null; // net ≤ 0 (after removals and credits)
  neutralityYearExCredits: number | null;
  totals: {
    gross: number;
    removals: number;
    credits: number;
    net: number;
    costNominal: number;
    costPV: number;
  };
}

export interface MacEntry {
  lever: LeverKey;
  label: string;
  abatedT: number; // cumulative tCO2e abated vs baseline over the horizon (net basis, undiscounted)
  abatedPVT: number; // same, discounted at the cost discount rate (used for levelised MAC)
  costPV: number; // INR, present value (negative = net saving)
  costNominal: number;
  macPerT: number | null; // INR per tCO2e (null if nothing abated)
}

export interface WaterfallStep {
  label: string;
  value: number; // signed delta, or absolute for totals
  kind: 'total' | 'delta';
}
