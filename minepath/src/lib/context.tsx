import { createContext, useContext } from 'react';
import type {
  Assumptions,
  CostSet,
  FactorRecord,
  InventoryLine,
  MacEntry,
  MonteCarloResult,
  NormalizedInputs,
  ParamRanges,
  ParamSet,
  RawInputs,
  Scenario,
  ScenarioResult,
  ValidationResult,
} from '../engine';
import type { AppState, TabId } from './state';

export interface Ctx {
  state: AppState;
  setTab: (t: TabId) => void;
  mineType: AppState['mineType'];
  inputs: RawInputs;
  patchInputs: (p: Partial<RawInputs>) => void;
  resetMine: () => void;
  validation: ValidationResult;
  norm: NormalizedInputs;
  assumptions: Assumptions;
  patchFactor: (id: string, p: Partial<FactorRecord>) => void;
  resetAssumptions: () => void;
  replaceAssumptions: (a: Assumptions) => void;
  params: ParamSet;
  ranges: ParamRanges;
  costs: CostSet;
  opts: { baseYear: number; horizonEnd: number };
  inventory: InventoryLine[];
  invTotals: { scope1: number; scope2: number; gross: number; low: number; high: number };
  scope3T: number;
  scenarios: Scenario[];
  activeScenario: Scenario;
  setActiveScenarioId: (id: string) => void;
  updateScenario: (id: string, fn: (s: Scenario) => Scenario) => void;
  results: Record<string, ScenarioResult>;
  active: ScenarioResult;
  mcAll: Record<string, MonteCarloResult>;
  mc: MonteCarloResult;
  mcMs: number;
  mcPending: boolean;
  setMc: (p: Partial<AppState['mc']>) => void;
  mac: MacEntry[];
  mineLabel: string;
  setMineType: (t: AppState['mineType']) => void;
  startGuide: () => void;
  resetAll: () => void;
}

export const AppCtx = createContext<Ctx | null>(null);

export function useCtx(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
}
