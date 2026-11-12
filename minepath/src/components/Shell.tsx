import { rangeText, yearText } from '../engine';
import { useCtx } from '../lib/context';
import { fmt0 } from '../lib/format';
import type { TabId } from '../lib/state';

/** The six-step journey. Status text is computed from live app state, never hard-coded. */
export const JOURNEY: { id: TabId; label: string; tech: string }[] = [
  { id: 'overview', label: 'Choose mine', tech: 'Mine profile' },
  { id: 'inputs', label: 'Mine data', tech: 'Activity data' },
  { id: 'inventory', label: 'Emissions', tech: 'Scope 1 + 2 inventory' },
  { id: 'pathway', label: 'Reduction plan', tech: 'Mitigation levers' },
  { id: 'uncertainty', label: 'Confidence range', tech: 'Monte Carlo P10–P90' },
  { id: 'recommendation', label: 'Recommendation', tech: 'Pathway report' },
];

export const EXTRA: { id: TabId; label: string }[] = [
  { id: 'sinks', label: 'Land & soil' },
  { id: 'costs', label: 'Costs' },
  { id: 'insights', label: 'Is it real?' },
  { id: 'planner', label: 'Plan finder' },
  { id: 'assumptions', label: 'Assumptions & sources' },
];

export const TAB_LABEL: Record<TabId, string> = Object.fromEntries([...JOURNEY, ...EXTRA].map((t) => [t.id, t.label])) as Record<TabId, string>;

const INTRO: Record<TabId, { title: string; text: string }> = {
  overview: { title: 'Start here', text: 'Pick a mine type, then follow the six steps on the left. Nothing is saved to a server; your work stays in this browser.' },
  inputs: { title: 'Tell us what the mine uses', text: 'Enter yearly activity: coal dug, fuel burned, electricity bought, explosives used. Units convert automatically and odd values are flagged.' },
  inventory: { title: 'Where do the emissions come from?', text: 'Scope 1 is what the mine burns or releases itself. Scope 2 is the electricity it buys. Open any line to see the exact sum.' },
  pathway: { title: 'Plan how to cut emissions', text: 'Switch on reduction levers and choose when each starts and how far it goes. Cuts, tree removals and bought credits are always shown separately.' },
  sinks: { title: 'How much can land and trees take back?', text: 'Planted trees and restored soil absorb carbon slowly. This page shows the estimate and how unsure it is.' },
  costs: { title: 'What does each tonne cut cost?', text: 'Cost per tonne of CO₂e avoided, lever by lever. Cheapest first is usually the best order.' },
  uncertainty: { title: 'How sure are we?', text: 'We re-run the plan thousands of times with slightly different assumptions. The result is a range of likely net-zero years, not a single promise.' },
  insights: { title: 'Is this net zero real?', text: 'See how much of the gap is closed by real cuts versus bought credits, and which assumption changes the answer most.' },
  planner: { title: 'Find the cheapest plan', text: 'Set a target year. MinePath tests many lever mixes and shows the cheapest ones that get there.' },
  recommendation: { title: 'Your pathway, in words', text: 'A plain-language summary built from your numbers. Copy it or save it as a PDF.' },
  assumptions: { title: 'Every number, with its source', text: 'Search any factor, see whether it is verified or still a demo value, and edit it. Changes update the whole app.' },
};

export function Stepper() {
  const { state, setTab, validation, invTotals, active, activeScenario, mc, opts, mineLabel, norm } = useCtx();
  const errs = validation.issues.filter((i) => i.level === 'error').length;
  const leversOn = (Object.values(activeScenario.levers) as { enabled: boolean }[]).filter((l) => l.enabled).length;
  const status: Record<string, { text: string; state: 'done' | 'warn' | 'todo' }> = {
    overview: { text: state.mineType === 'underground' ? 'Underground' : 'Open-cast', state: 'done' },
    inputs: errs > 0 ? { text: `${errs} to fix`, state: 'warn' } : { text: 'Inputs complete', state: 'done' },
    inventory: norm.coalT > 0 ? { text: `${fmt0(invTotals.gross)} t CO₂e/yr`, state: 'done' } : { text: 'Needs coal output', state: 'warn' },
    pathway: leversOn > 0 ? { text: `${leversOn} lever${leversOn > 1 ? 's' : ''} on · ${yearText(active.neutralityYear, opts.horizonEnd)}`, state: 'done' } : { text: 'No levers yet', state: 'todo' },
    uncertainty: { text: rangeText(mc, opts.horizonEnd).replace(' to ', '–'), state: 'done' },
    recommendation: { text: active.neutralityYear ? 'Pathway ready' : 'Not net zero yet', state: active.neutralityYear ? 'done' : 'warn' },
  };
  void mineLabel;
  return (
    <nav className="journey" aria-label="Your journey">
      <ol>
        {JOURNEY.map((s, i) => {
          const st = status[s.id];
          const on = state.tab === s.id;
          return (
            <li key={s.id}>
              <button className={`step ${on ? 'on' : ''} ${st.state}`} onClick={() => setTab(s.id)} aria-current={on ? 'step' : undefined} title={s.tech}>
                <span className="step-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="step-body">
                  <span className="step-label">{s.label}{st.state === 'done' && !on ? <span className="step-tick"> ✓</span> : st.state === 'warn' ? <span className="step-tick warn"> !</span> : null}</span>
                  <span className="step-status">{st.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="extras" role="group" aria-label="Go deeper">
        <span className="extras-label">Go deeper</span>
        {EXTRA.map((e) => (
          <button key={e.id} className={`pill ${state.tab === e.id ? 'on' : ''}`} onClick={() => setTab(e.id)} aria-current={state.tab === e.id ? 'page' : undefined}>
            {e.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function TabIntro() {
  const { state, setTab } = useCtx();
  if (state.tab === 'overview') return null;
  const i = INTRO[state.tab];
  const journeyIdx = JOURNEY.findIndex((j) => j.id === state.tab);
  return (
    <div className="intro">
      <div>
        {journeyIdx >= 0 && <div className="eyebrow">Step {journeyIdx + 1} of {JOURNEY.length}</div>}
        <h2>{i.title}</h2>
        <p>{i.text}</p>
      </div>
      <div className="btn-row no-print">
        {state.tab !== 'inputs' && <button className="btn" onClick={() => setTab('inputs')}>Edit inputs</button>}
        {state.tab !== 'assumptions' && <button className="btn" onClick={() => setTab('assumptions')}>View assumptions</button>}
      </div>
    </div>
  );
}

/** One dominant call to action per screen; it always does something real. */
export function CtaBar() {
  const { state, setTab } = useCtx();
  const go = (t: TabId) => () => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const map: Record<TabId, { label: string; hint: string; run: () => void } | null> = {
    overview: null,
    inputs: { label: 'Calculate emissions', hint: 'Next: see where the emissions come from', run: go('inventory') },
    inventory: { label: 'Choose reduction levers', hint: 'Next: plan how to cut them', run: go('pathway') },
    pathway: { label: 'Compare scenarios', hint: 'Next: see how confident the net-zero year is', run: go('uncertainty') },
    uncertainty: { label: 'See the recommendation', hint: 'Next: read the plan in plain words', run: go('recommendation') },
    recommendation: { label: 'Export pathway report', hint: 'Opens your browser’s print dialog: choose “Save as PDF”', run: () => window.print() },
    sinks: { label: 'Back to my reduction plan', hint: 'Land and soil removals are included in the plan', run: go('pathway') },
    costs: { label: 'Check if it is real net zero', hint: 'Next: credits versus real cuts', run: go('insights') },
    insights: { label: 'Find the cheapest plan', hint: 'Next: let MinePath search lever mixes', run: go('planner') },
    planner: { label: 'See the recommendation', hint: 'Next: read the plan in plain words', run: go('recommendation') },
    assumptions: { label: 'Back to my pathway', hint: 'Your edits already updated every result', run: go('pathway') },
  };
  const c = map[state.tab];
  if (!c) return null;
  return (
    <div className="ctabar no-print">
      <span className="small">{c.hint}</span>
      <button className="btn cta-light" onClick={c.run}>{c.label} <span aria-hidden="true">→</span></button>
    </div>
  );
}
