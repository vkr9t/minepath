export const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
export const nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const fmt0 = (n: number) => (Number.isFinite(n) ? nf0.format(Math.round(n)) : '—');
export const fmt1 = (n: number) => (Number.isFinite(n) ? nf1.format(n) : '—');
export const fmt2 = (n: number) => (Number.isFinite(n) ? nf2.format(n) : '—');
export const fmt3 = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—');

/** Compact tonnes for axes: 120000 → 120k, 1.2e6 → 1.2M */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

export const crore = (inr: number) => inr / 1e7;
export const fmtCrore = (inr: number) => `₹${nf1.format(crore(inr))} cr`;
export const fmtInr = (n: number) => `₹${nf0.format(Math.round(n))}`;

export function yearOrBeyond(y: number | null, end: number): string {
  return y === null ? `>${end}` : String(y);
}
