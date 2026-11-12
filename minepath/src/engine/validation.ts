import type { NormalizedInputs, Quantity, RawInputs, ValidationIssue, ValidationResult } from './types';
import { toBase, type QuantityKind } from './units';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate raw inputs and normalise to base units.
 * Invalid values are reported as errors and replaced by 0 in the normalised output,
 * so downstream calculations never see NaN.
 */
export function validateInputs(raw: RawInputs): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, level: 'error', message });
  const warn = (field: string, message: string) => issues.push({ field, level: 'warning', message });

  const qty = (field: string, q: Quantity, kind: QuantityKind, label: string, required: boolean): number => {
    if (!isNum(q.value)) {
      if (required) err(field, `${label} is required and must be a number.`);
      return 0;
    }
    if (q.value < 0) {
      err(field, `${label} cannot be negative.`);
      return 0;
    }
    const base = toBase(kind, q.value, q.unit);
    if (!Number.isFinite(base)) {
      err(field, `Unknown unit "${q.unit}" for ${label}.`);
      return 0;
    }
    return base;
  };

  const plain = (field: string, v: number | null, label: string, required: boolean): number => {
    if (!isNum(v)) {
      if (required) err(field, `${label} is required and must be a number.`);
      return 0;
    }
    if (v < 0) {
      err(field, `${label} cannot be negative.`);
      return 0;
    }
    return v;
  };

  const coalT = qty('coal', raw.coal, 'coal', 'Coal production', true);
  if (coalT === 0 && isNum(raw.coal.value) && raw.coal.value === 0) {
    warn('coal', 'Coal production is zero, so intensity metrics and methane cannot be computed.');
  }
  const dieselL = qty('diesel', raw.diesel, 'diesel', 'Diesel for excavation & haulage', true);
  const equipmentHours = plain('equipmentHours', raw.equipmentHours, 'Equipment operating hours', true);
  const equipmentFuelRate = plain('equipmentFuelRate', raw.equipmentFuelRate, 'Equipment fuel rate', true);
  const electricityKWh = qty('electricity', raw.electricity, 'electricity', 'Purchased electricity', true);
  const explosivesKg = qty('explosives', raw.explosives, 'explosives', 'Explosives', true);

  let methaneOverride: number | null = null;
  if (raw.methaneOverride !== null && raw.methaneOverride !== undefined && String(raw.methaneOverride) !== '') {
    if (!isNum(raw.methaneOverride)) err('methaneOverride', 'Methane intensity override must be a number.');
    else if (raw.methaneOverride < 0) err('methaneOverride', 'Methane intensity override cannot be negative.');
    else {
      methaneOverride = raw.methaneOverride;
      if (methaneOverride > 60) warn('methaneOverride', 'Methane intensity above 60 kg CH4/t coal is unusually high. Check the unit.');
    }
  }

  let captureRatePct = plain('captureRate', raw.captureRate, 'Capture rate', false);
  if (captureRatePct > 100) {
    err('captureRate', 'Capture rate cannot exceed 100%.');
    captureRatePct = 100;
  }
  if (!raw.captureAvailable && captureRatePct > 0) {
    warn('captureRate', 'Capture is marked unavailable, so the capture rate is ignored and the capture lever has no effect.');
  }

  const reclaimedHa = plain('reclaimedHa', raw.reclaimedHa, 'Reclaimed / afforested area', false);
  const plantationAge = plain('plantationAge', raw.plantationAge, 'Plantation age', false);
  if (plantationAge > 40) warn('plantationAge', 'Plantation age above 40 years is outside the range the growth curve is meant for.');
  const soilCarbonT = plain('soilCarbon', raw.soilCarbon, 'Soil-carbon estimate', false);
  if (raw.includeSoil && soilCarbonT === 0) warn('soilCarbon', 'Soil carbon is included but the estimate is zero.');

  let productionGrowth = 0;
  if (isNum(raw.productionGrowthPct)) {
    if (raw.productionGrowthPct < -20 || raw.productionGrowthPct > 20) {
      err('productionGrowthPct', 'Annual production change must be between −20% and +20%.');
    } else productionGrowth = raw.productionGrowthPct / 100;
  }

  // Plausibility warnings (activity per tonne of coal)
  if (coalT > 0) {
    const dpt = (dieselL + equipmentHours * equipmentFuelRate) / coalT;
    if (dpt > 15) warn('diesel', `Total diesel is ${dpt.toFixed(1)} L per tonne of coal, which looks high. Check units.`);
    if (dpt < 0.05 && dieselL > 0) warn('diesel', `Total diesel is only ${dpt.toFixed(2)} L per tonne of coal, which looks low. Check units.`);
    const ept = electricityKWh / coalT;
    if (ept > 300) warn('electricity', `Electricity is ${ept.toFixed(0)} kWh per tonne of coal, which looks high. Check units.`);
    const xpt = explosivesKg / coalT;
    if (xpt > 10) warn('explosives', `Explosives are ${xpt.toFixed(1)} kg per tonne of coal, which looks high. Check units.`);
  }

  const normalized: NormalizedInputs = {
    mineType: raw.mineType,
    coalT,
    dieselL,
    equipmentHours,
    equipmentFuelRate,
    equipmentL: equipmentHours * equipmentFuelRate,
    electricityKWh,
    explosivesKg,
    methaneOverride,
    captureAvailable: !!raw.captureAvailable,
    captureRate: captureRatePct / 100,
    reclaimedHa,
    plantationAge,
    soilCarbonT,
    includeSoil: !!raw.includeSoil,
    productionGrowth,
    includeScope3: !!raw.includeScope3,
  };

  return { normalized, issues, hasErrors: issues.some((i) => i.level === 'error') };
}
