import type { LeverKey, SourceKey } from '../engine';

// Restrained palette: warm earth tones for emissions, green for removals, purple for credits,
// steel blue for uncertainty. Chosen to stay distinguishable for common colour-vision deficiencies.
export const SOURCE_COLORS: Record<SourceKey, string> = {
  methane: '#9c2f3b',
  diesel: '#c2711a',
  equipment: '#e0a93b',
  electricity: '#3d6f9e',
  explosives: '#6f7782',
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  methane: 'Fugitive methane',
  diesel: 'Diesel (haulage)',
  equipment: 'Equipment fuel',
  electricity: 'Electricity (Scope 2)',
  explosives: 'Explosives',
};

export const SOURCE_ORDER: SourceKey[] = ['methane', 'diesel', 'equipment', 'electricity', 'explosives'];

export const LEVER_COLORS: Record<LeverKey, string> = {
  ev: '#c2711a',
  capture: '#9c2f3b',
  ppa: '#3d6f9e',
  afforestation: '#2f7d5b',
  credits: '#7d5ba6',
};

export const C = {
  gross: '#9c2f3b',
  removals: '#2f7d5b',
  soil: '#7fb89a',
  credits: '#7d5ba6',
  net: '#26323a',
  band: '#9db4c9',
  bandStroke: '#6f93b3',
  grid: '#dde2e6',
  axis: '#5b6670',
  zero: '#26323a',
  scenarios: ['#6f7782', '#2f7d5b', '#c2711a', '#3d6f9e'],
};
