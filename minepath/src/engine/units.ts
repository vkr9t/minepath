// Unit tables and the single conversion function. All conversion lives here.

export const UNIT_TABLES = {
  coal: { t: 1, kt: 1e3, Mt: 1e6 },
  diesel: { L: 1, kL: 1e3, ML: 1e6 },
  electricity: { kWh: 1, MWh: 1e3, GWh: 1e6 },
  explosives: { kg: 1, t: 1e3 },
} as const;

export type QuantityKind = keyof typeof UNIT_TABLES;

export function unitsFor(kind: QuantityKind): string[] {
  return Object.keys(UNIT_TABLES[kind]);
}

/** Convert a value in `unit` to the base unit of `kind` (t, L, kWh, kg). Returns NaN for unknown units. */
export function toBase(kind: QuantityKind, value: number, unit: string): number {
  const table = UNIT_TABLES[kind] as Record<string, number>;
  const mult = table[unit];
  if (mult === undefined) return NaN;
  return value * mult;
}

export const BASE_UNIT: Record<QuantityKind, string> = {
  coal: 't',
  diesel: 'L',
  electricity: 'kWh',
  explosives: 'kg',
};
