// Afforestation / reclamation sink model: Chapman–Richards stock curve per hectare.
// Stock(age) = Cmax · (1 − e^(−k·age))^p   [tCO2e/ha]
// Annual removal at a given age = Stock(age + 1) − Stock(age). It is NOT a constant per year.

export function carbonStock(age: number, cmax: number, k: number, p: number): number {
  if (age <= 0) return 0;
  return cmax * Math.pow(1 - Math.exp(-k * age), p);
}

/** tCO2e/ha removed during the year in which the plantation goes from `age` to `age + 1`. */
export function annualRemovalPerHa(age: number, cmax: number, k: number, p: number): number {
  if (age < 0) return 0;
  return carbonStock(age + 1, cmax, k, p) - carbonStock(age, cmax, k, p);
}

/** tCO2e removed in one year by a cohort of `ha` hectares at `age`, after survival. */
export function cohortRemoval(ha: number, age: number, survival: number, cmax: number, k: number, p: number): number {
  return ha * survival * annualRemovalPerHa(age, cmax, k, p);
}

/** Convenience: removals per year for an existing plantation, for charting the growth curve. */
export function growthCurve(
  maxAge: number,
  cmax: number,
  k: number,
  p: number,
): { age: number; stock: number; annual: number }[] {
  const out: { age: number; stock: number; annual: number }[] = [];
  for (let a = 0; a <= maxAge; a++) {
    out.push({ age: a, stock: carbonStock(a, cmax, k, p), annual: annualRemovalPerHa(a, cmax, k, p) });
  }
  return out;
}
