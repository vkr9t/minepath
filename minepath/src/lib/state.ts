import assumptionsJson from '../config/assumptions.json';
import samples from '../config/samples.json';
import type { Assumptions, FactorRecord, MineType, RawInputs, Scenario } from '../engine';
import { DEFAULT_SPREAD, type Spread } from '../engine';

export interface MineState {
  inputs: RawInputs;
  scenarios: Scenario[];
}

export interface McSettings {
  iterations: number;
  seed: number;
  spread: Spread;
}

export type TabId =
  | 'overview'
  | 'insights'
  | 'planner'
  | 'inputs'
  | 'inventory'
  | 'pathway'
  | 'sinks'
  | 'costs'
  | 'uncertainty'
  | 'recommendation'
  | 'assumptions';

export interface AppState {
  version: 1;
  mineType: MineType;
  mines: Record<MineType, MineState>;
  activeScenarioId: Record<MineType, string>;
  assumptions: Assumptions;
  mc: McSettings;
  tab: TabId;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function defaultAssumptions(): Assumptions {
  const a = assumptionsJson as unknown as { baseYear: number; horizonEnd: number; factors: FactorRecord[] };
  return clone({ baseYear: a.baseYear, horizonEnd: a.horizonEnd, factors: a.factors });
}

export function defaultMine(t: MineType): MineState {
  const s = samples[t] as unknown as { inputs: RawInputs; scenarios: Scenario[] };
  return clone({ inputs: s.inputs, scenarios: s.scenarios });
}

export function defaultState(): AppState {
  return {
    version: 1,
    mineType: 'underground',
    mines: { opencast: defaultMine('opencast'), underground: defaultMine('underground') },
    activeScenarioId: { opencast: 'aggressive', underground: 'aggressive' },
    assumptions: defaultAssumptions(),
    mc: { iterations: 1000, seed: 42, spread: { ...DEFAULT_SPREAD } },
    tab: 'overview',
  };
}

const KEY = 'minepath.state.v2';

export function loadState(): AppState {
  const def = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<AppState>;
    if (p.version !== 1 || !p.mines || !p.assumptions) return def;
    // Merge in any factor ids added since the state was saved, so the engine never misses one.
    const have = new Set(p.assumptions.factors.map((f) => f.id));
    const merged: Assumptions = {
      ...p.assumptions,
      factors: [...p.assumptions.factors, ...def.assumptions.factors.filter((f) => !have.has(f.id))],
    };
    return {
      ...def,
      ...p,
      mines: {
        opencast: { ...def.mines.opencast, ...p.mines.opencast },
        underground: { ...def.mines.underground, ...p.mines.underground },
      },
      assumptions: merged,
      mc: { ...def.mc, ...p.mc, spread: { ...def.mc.spread, ...(p.mc?.spread ?? {}) } },
    };
  } catch {
    return def;
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable; app still works without persistence */
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
