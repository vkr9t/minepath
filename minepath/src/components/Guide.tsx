import type { TabId } from '../lib/state';

export interface GuideStep {
  tab: TabId;
  mine?: 'opencast' | 'underground';
  scenario?: string;
  title: string;
  text: string;
  seconds: number;
}

/** About three minutes in total. Narration only describes what is on screen; it quotes no numbers that could go stale. */
export const GUIDE_STEPS: GuideStep[] = [
  { tab: 'overview', mine: 'underground', scenario: 'aggressive', seconds: 20, title: '1. The problem',
    text: 'A coal mine must prove its Scope 1 and 2 emissions, then show a credible path to neutrality. MinePath turns raw mine data into that proof, with the uncertainty shown, not hidden.' },
  { tab: 'inputs', seconds: 20, title: '2. Enter mine data',
    text: 'Plain activity data: coal, diesel, electricity, explosives, methane. Units convert, bad entries are flagged instead of silently used, and every input saves in the browser.' },
  { tab: 'inventory', seconds: 25, title: '3. Auditable inventory',
    text: 'Every line is activity × factor with the formula visible and a range. Underground mines are dominated by methane, so the tool refuses to treat the two mine types alike.' },
  { tab: 'pathway', seconds: 30, title: '4. Build a pathway',
    text: 'Five levers with start year, ramp and adoption. Gross emissions, removals and credits are always separate so credits cannot hide behind real cuts.' },
  { tab: 'insights', seconds: 30, title: '5. Is it real net zero?',
    text: 'The integrity bar shows how much of the gap is real cuts, estimated removals or purchased credits. The tornado shows which assumption matters most, so you know which data to verify first.' },
  { tab: 'uncertainty', seconds: 25, title: '6. Uncertainty',
    text: 'Monte Carlo runs give a P10 to P90 net-zero year instead of one false-precision date. A fixed seed makes the run reproducible.' },
  { tab: 'planner', seconds: 25, title: '7. Plan finder',
    text: 'Pick a target year and a cap on credits. It searches lever combinations and returns the cheapest plans that qualify, or says honestly that none do.' },
  { tab: 'assumptions', seconds: 20, title: '8. Honest sourcing',
    text: 'Verified factors carry source, year and link. Everything else is labelled a demo assumption and is editable. Nothing is presented as an official value unless it was read from the source.' },
];

export default function Guide(props: { step: number; onStep: (n: number) => void; onClose: () => void }) {
  const s = GUIDE_STEPS[props.step];
  const last = props.step === GUIDE_STEPS.length - 1;
  return (
    <aside className="guide no-print" role="dialog" aria-label="Guided demo">
      <div className="guide-bar"><i style={{ width: `${((props.step + 1) / GUIDE_STEPS.length) * 100}%` }} /></div>
      <h4>{s.title}</h4>
      <p>{s.text}</p>
      <div className="btn-row">
        <button className="btn" disabled={props.step === 0} onClick={() => props.onStep(props.step - 1)}>Back</button>
        {last ? (
          <button className="btn primary" onClick={props.onClose}>Finish</button>
        ) : (
          <button className="btn primary" onClick={() => props.onStep(props.step + 1)}>Next</button>
        )}
        <button className="btn" onClick={props.onClose}>Exit</button>
        <span className="small" style={{ alignSelf: 'center', opacity: 0.8 }}>~{s.seconds}s · {props.step + 1}/{GUIDE_STEPS.length}</span>
      </div>
    </aside>
  );
}
