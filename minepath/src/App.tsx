import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  computeInventory,
  computeMac,
  intensityPerTonne,
  inventoryTotals,
  rangeText,
  resolveCosts,
  resolveParams,
  resolveRanges,
  runMonteCarlo,
  scope3Memo,
  simulateScenario,
  validateInputs,
  yearText,
  type Assumptions,
  type FactorRecord,
  type MonteCarloResult,
  type RawInputs,
  type Scenario,
  type ScenarioResult,
} from './engine';
import { AppCtx, type Ctx } from './lib/context';
import { clearSaved, defaultAssumptions, defaultMine, defaultState, loadState, saveState, type AppState, type TabId } from './lib/state';
import { fmt0 } from './lib/format';
import { Badge, Kpi, Notice } from './components/ui';
import Overview from './tabs/Overview';
import InputsTab from './tabs/InputsTab';
import InventoryTab from './tabs/InventoryTab';
import PathwayTab from './tabs/PathwayTab';
import SinksTab from './tabs/SinksTab';
import CostsTab from './tabs/CostsTab';
import UncertaintyTab from './tabs/UncertaintyTab';
import Logo from './components/Logo';
import { CtaBar, Stepper, TabIntro } from './components/Shell';
import Guide, { GUIDE_STEPS } from './components/Guide';
import InsightsTab from './tabs/InsightsTab';
import PlannerTab from './tabs/PlannerTab';
import RecommendationTab from './tabs/RecommendationTab';
import AssumptionsTab from './tabs/AssumptionsTab';

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  useEffect(() => saveState(state), [state]);

  const [guideStep, setGuideStep] = useState<number | null>(null);
  const goGuide = (n: number) => {
    const g = GUIDE_STEPS[n];
    setGuideStep(n);
    setState((s) => {
      const mt = g.mine ?? s.mineType;
      return { ...s, mineType: mt, tab: g.tab, activeScenarioId: g.scenario ? { ...s.activeScenarioId, [mt]: g.scenario } : s.activeScenarioId };
    });
  };
  const mineType = state.mineType;
  const mine = state.mines[mineType];
  const inputs = mine.inputs;
  const assumptions = state.assumptions;

  const opts = useMemo(() => ({ baseYear: assumptions.baseYear, horizonEnd: assumptions.horizonEnd }), [assumptions.baseYear, assumptions.horizonEnd]);
  const validation = useMemo(() => validateInputs(inputs), [inputs]);
  const norm = validation.normalized;
  const params = useMemo(() => resolveParams(assumptions, norm), [assumptions, norm]);
  const ranges = useMemo(() => resolveRanges(assumptions, norm), [assumptions, norm]);
  const costs = useMemo(() => resolveCosts(assumptions), [assumptions]);
  const inventory = useMemo(() => computeInventory(norm, params, assumptions, ranges), [norm, params, assumptions, ranges]);
  const invTotals = useMemo(() => inventoryTotals(inventory), [inventory]);
  const scope3T = useMemo(() => scope3Memo(norm, params), [norm, params]);

  const scenarios = mine.scenarios;
  const activeId = state.activeScenarioId[mineType];
  const activeScenario = scenarios.find((s) => s.id === activeId) ?? scenarios[1] ?? scenarios[0];

  const results = useMemo(() => {
    const out: Record<string, ScenarioResult> = {};
    scenarios.forEach((s) => {
      out[s.id] = simulateScenario(norm, s, params, costs, opts);
    });
    return out;
  }, [scenarios, norm, params, costs, opts]);
  const active = results[activeScenario.id];

  const mac = useMemo(() => computeMac(norm, activeScenario, params, costs, opts), [norm, activeScenario, params, costs, opts]);

  // Monte Carlo runs on a deferred copy so typing stays responsive.
  const mcBundle = useMemo(
    () => ({ norm, ranges, costs, scenarios, opts, settings: state.mc }),
    [norm, ranges, costs, scenarios, opts, state.mc],
  );
  const deferredBundle = useDeferredValue(mcBundle);
  const mcPending = deferredBundle !== mcBundle;
  const mcRun = useMemo(() => {
    const t0 = performance.now();
    const out: Record<string, MonteCarloResult> = {};
    deferredBundle.scenarios.forEach((s) => {
      out[s.id] = runMonteCarlo(deferredBundle.norm, s, deferredBundle.ranges, deferredBundle.costs, deferredBundle.opts, deferredBundle.settings);
    });
    return { out, ms: performance.now() - t0 };
  }, [deferredBundle]);
  const mcAll = mcRun.out;
  const mc = mcAll[activeScenario.id] ?? Object.values(mcAll)[0];

  // ---- state updaters ----
  const patchInputs = useCallback(
    (p: Partial<RawInputs>) =>
      setState((s) => ({
        ...s,
        mines: { ...s.mines, [s.mineType]: { ...s.mines[s.mineType], inputs: { ...s.mines[s.mineType].inputs, ...p } } },
      })),
    [],
  );
  const resetMine = useCallback(
    () =>
      setState((s) => ({
        ...s,
        mines: { ...s.mines, [s.mineType]: defaultMine(s.mineType) },
        activeScenarioId: { ...s.activeScenarioId, [s.mineType]: 'aggressive' },
      })),
    [],
  );
  const updateScenario = useCallback(
    (id: string, fn: (s: Scenario) => Scenario) =>
      setState((s) => ({
        ...s,
        mines: {
          ...s.mines,
          [s.mineType]: {
            ...s.mines[s.mineType],
            scenarios: s.mines[s.mineType].scenarios.map((sc) => (sc.id === id && !sc.locked ? fn(sc) : sc)),
          },
        },
      })),
    [],
  );
  const setActiveScenarioId = useCallback(
    (id: string) => setState((s) => ({ ...s, activeScenarioId: { ...s.activeScenarioId, [s.mineType]: id } })),
    [],
  );
  const patchFactor = useCallback(
    (id: string, p: Partial<FactorRecord>) =>
      setState((s) => ({
        ...s,
        assumptions: { ...s.assumptions, factors: s.assumptions.factors.map((f) => (f.id === id ? { ...f, ...p } : f)) },
      })),
    [],
  );
  const resetAssumptions = useCallback(() => setState((s) => ({ ...s, assumptions: defaultAssumptions() })), []);
  const replaceAssumptions = useCallback((a: Assumptions) => setState((s) => ({ ...s, assumptions: a })), []);
  const setTab = useCallback((t: TabId) => setState((s) => ({ ...s, tab: t })), []);
  const setMc = useCallback((p: Partial<AppState['mc']>) => setState((s) => ({ ...s, mc: { ...s.mc, ...p } })), []);

  const mineLabel = mineType === 'underground' ? 'the underground mine' : 'the open-cast mine';

  const ctx: Ctx = {
    state,
    setTab,
    mineType,
    inputs,
    patchInputs,
    resetMine,
    validation,
    norm,
    assumptions,
    patchFactor,
    resetAssumptions,
    replaceAssumptions,
    params,
    ranges,
    costs,
    opts,
    inventory,
    invTotals,
    scope3T,
    scenarios,
    activeScenario,
    setActiveScenarioId,
    updateScenario,
    results,
    active,
    mcAll,
    mc,
    mcMs: mcRun.ms,
    mcPending,
    setMc,
    mac,
    mineLabel,
    setMineType: (m) => setState((s) => ({ ...s, mineType: m })),
    startGuide: () => goGuide(0),
    resetAll: () => {
      if (window.confirm('Reset the demo? This clears all saved edits (inputs, scenarios, assumptions) and reloads the defaults.')) {
        clearSaved();
        setState(defaultState());
      }
    },
  };

  const last = active.rows[active.rows.length - 1];
  const intensity = intensityPerTonne(invTotals.gross, norm.coalT);
  const demoCount = assumptions.factors.filter((f) => f.status === 'demo_assumption').length;
  const errCount = validation.issues.filter((i) => i.level === 'error').length;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <Logo />
          </div>
          <div className="controls">
            <div className="seg dark" role="group" aria-label="Mine type">
              {(['opencast', 'underground'] as const).map((t) => (
                <button key={t} className={mineType === t ? 'on' : ''} aria-pressed={mineType === t} onClick={() => setState((s) => ({ ...s, mineType: t }))}>
                  {t === 'opencast' ? 'Open-cast' : 'Underground'}
                </button>
              ))}
            </div>
            <label className="select-wrap">
              <span className="small">Plan</span>
              <select value={activeScenario.id} onChange={(e) => setActiveScenarioId(e.target.value)} aria-label="Plan to view">
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn ghost" onClick={() => goGuide(0)}>▶ Take the tour</button>
            <button className="trust" onClick={() => setTab('assumptions')} title="Open the assumptions and sources page">
              <span className="trust-ok">{assumptions.factors.length - demoCount} verified</span>
              <span className="trust-demo">{demoCount} demo</span>
            </button>
            <button className="btn ghost" onClick={ctx.resetAll}>Reset demo</button>
          </div>
        </header>



        {errCount > 0 && (
          <Notice kind="warn">
            {errCount} input error{errCount > 1 ? 's' : ''} found: invalid fields are treated as 0 until fixed. See the <button className="link" onClick={() => setTab('inputs')}>Mine inputs</button> tab.
          </Notice>
        )}

        <Stepper />
        <TabIntro />
        {state.tab !== 'overview' && <div className="kpis">
          <Kpi
            label={`Gross emissions ${opts.baseYear} (Scope 1+2)`}
            value={`${fmt0(invTotals.gross)} tCO₂e`}
            sub={`factor range ${fmt0(invTotals.low)}–${fmt0(invTotals.high)} · ${intensity.toFixed(3)} t/t coal`}
          />
          <Kpi
            label={`Gross emissions ${opts.horizonEnd} (${activeScenario.name.split('—')[0].trim()})`}
            value={`${fmt0(last.gross)} tCO₂e`}
            sub={`net after removals & credits: ${fmt0(last.net)} (est.)`}
            tone={last.net <= 0 ? 'good' : 'default'}
          />
          <Kpi
            label={`Cumulative net ${opts.baseYear}–${opts.horizonEnd}`}
            value={`${fmt0(active.totals.net)} tCO₂e`}
            sub={`gross ${fmt0(active.totals.gross)} · removals ${fmt0(active.totals.removals)} (est.) · credits ${fmt0(active.totals.credits)}`}
          />
          <Kpi
            label="Estimated net-zero year"
            value={yearText(active.neutralityYear, opts.horizonEnd)}
            sub={active.neutralityYearExCredits === null && active.neutralityYear !== null ? 'relies on credits (offsets)' : 'deterministic estimate'}
            tone={active.neutralityYear === null ? 'bad' : 'good'}
          />
          <Kpi
            label={`P10–P90 range (${mc.iterations.toLocaleString('en-IN')} runs)`}
            value={rangeText(mc, opts.horizonEnd).replace(' to ', ' – ')}
            sub={`${(mc.probNotReached * 100).toFixed(0)}% of runs not reached by ${opts.horizonEnd}${mcPending ? ' · updating…' : ''}`}
            tone="band"
          />
        </div>}

        <main>
          {state.tab === 'overview' && <Overview />}
          {state.tab === 'inputs' && <InputsTab />}
          {state.tab === 'inventory' && <InventoryTab />}
          {state.tab === 'pathway' && <PathwayTab />}
          {state.tab === 'sinks' && <SinksTab />}
          {state.tab === 'costs' && <CostsTab />}
          {state.tab === 'uncertainty' && <UncertaintyTab />}
          {state.tab === 'insights' && <InsightsTab />}
          {state.tab === 'planner' && <PlannerTab />}
          {state.tab === 'recommendation' && <RecommendationTab />}
          {state.tab === 'assumptions' && <AssumptionsTab />}
        </main>
        <CtaBar />

        <footer className="footer">
          <span>
            MinePath is a planning aid with illustrative data. It is not professional engineering, regulatory or investment advice. Net-zero here means annual net emissions ≤ 0 after estimated removals and (separately shown) credits.
          </span>
          <button
            className="link"
            onClick={ctx.resetAll}
          >
            Reset everything
          </button>
        </footer>
      </div>
      {guideStep !== null && <Guide step={guideStep} onStep={goGuide} onClose={() => setGuideStep(null)} />}
    </AppCtx.Provider>
  );
}

