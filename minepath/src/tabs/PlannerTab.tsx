import { useMemo, useState } from 'react';
import { findPlans } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, Notice } from '../components/ui';
import { fmt0 } from '../lib/format';

const crore = (inr: number) => `₹${(inr / 1e7).toFixed(0)} cr`;

export default function PlannerTab() {
  const { norm, activeScenario, params, costs, opts, scenarios, updateScenario, setActiveScenarioId, setTab } = useCtx();
  const [target, setTarget] = useState(2038);
  const [cap, setCap] = useState(100);
  const [applied, setApplied] = useState<string | null>(null);

  const found = useMemo(
    () => findPlans(norm, activeScenario, params, costs, opts, { targetYear: target, maxCreditShare: cap / 100, captureAvailable: norm.captureAvailable }),
    [norm, activeScenario, params, costs, opts, target, cap],
  );
  const relaxed = useMemo(() => {
    if (found.plans.length > 0 || cap >= 100) return null;
    const r = findPlans(norm, activeScenario, params, costs, opts, { targetYear: target, maxCreditShare: 1, captureAvailable: norm.captureAvailable });
    if (r.plans.length === 0) return null;
    return Math.min(...r.plans.map((p) => p.creditShare));
  }, [found, norm, activeScenario, params, costs, opts, target, cap]);
  const editable = scenarios.filter((s) => !s.locked);

  const apply = (planIdx: number, id: string) => {
    const plan = found.plans[planIdx];
    const target = scenarios.find((s) => s.id === id);
    if (!plan || !target) return;
    updateScenario(id, (s) => ({ ...plan.scenario, id: s.id, name: s.name, locked: false }));
    setActiveScenarioId(id);
    setApplied(`${target.name} now uses plan ${planIdx + 1}.`);
    setTab('pathway');
  };

  return (
    <div className="stack">
      <Card
        title="Plan finder: cheapest route to a net-zero year"
        subtitle="Tries every combination of fleet electrification, methane capture, renewable PPA and afforestation (0 / 50 / 100%), sizes carbon credits to close the rest, and keeps plans that stay under your credit cap. Ranked by present-value cost."
      >
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Target net-zero year: {target}</span>
            <input type="range" min={opts.baseYear + 5} max={opts.horizonEnd} step={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            <span className="hint">Net emissions must be ≤ 0 in or before this year.</span>
          </label>
          <label className="field">
            <span className="field-label">Max credits as share of remaining emissions: {cap}%</span>
            <input type="range" min={0} max={100} step={5} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
            <span className="hint">Lower = more real cuts required. 0% means credits are not allowed to close any gap.</span>
          </label>
        </div>
        <p className="xsmall muted">
          {found.evaluated} combinations tested, {found.feasible} met the target and cap. Uses central parameter values; check the winning plan on the Uncertainty tab before relying on it.
          {!norm.captureAvailable && ' Methane capture is skipped because this mine has no capture available.'}
        </p>
        {applied && <Notice kind="info">{applied}</Notice>}
      </Card>

      {found.plans.length === 0 ? (
        <Notice kind="warn">{found.infeasibleReason}{relaxed !== null && ` The lowest credit share any tested plan needs for ${target} is ${(relaxed * 100).toFixed(0)}%.`}</Notice>
      ) : (
        <div className="plan-grid">
          {found.plans.map((p, i) => (
            <div key={i} className={`plan ${i === 0 ? 'best' : ''}`}>
              <div className="btn-row" style={{ justifyContent: 'space-between' }}>
                <b>Plan {i + 1}</b>
                {i === 0 && <Badge kind="ok">Lowest cost</Badge>}
              </div>
              <ul className="small" style={{ paddingLeft: 18, margin: '8px 0' }}>
                <li>Fleet electrification: {p.adoption.ev}%</li>
                {norm.captureAvailable && <li>Methane capture: {p.adoption.capture}%</li>}
                <li>Renewable PPA: {p.adoption.ppa}%</li>
                <li>Afforestation: {p.adoption.ha ? `+${fmt0(p.adoption.ha)} ha` : 'none added'}</li>
                <li>Credits: {fmt0(p.creditVolume)} tCO₂e/yr at full ramp</li>
              </ul>
              <div className="small">
                Net zero: <b>{p.result.neutralityYear}</b> · PV cost <b>{crore(p.costPV)}</b>
              </div>
              <div className="small">
                Credits are {(p.creditShare * 100).toFixed(0)}% of remaining emissions in {target}{' '}
                <Badge kind={p.creditShare < 0.2 ? 'ok' : p.creditShare <= 0.5 ? 'warn' : 'err'}>{p.creditShare < 0.2 ? 'mostly real cuts' : p.creditShare <= 0.5 ? 'credit-assisted' : 'credit-dependent'}</Badge>
              </div>
              <div className="btn-row no-print" style={{ marginTop: 10 }}>
                {editable.map((s) => (
                  <button key={s.id} className="btn" onClick={() => apply(i, s.id)}>Apply to {s.name.split('—')[0].trim()}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="xsmall muted">Search is a transparent grid search, not an optimiser: timing is fixed (levers start 1–2 years after the base year and ramp over 4–7 years), so a hand-tuned plan can still beat it. Costs and factors are demo assumptions unless marked verified. Not engineering, regulatory or investment advice.</p>
    </div>
  );
}
