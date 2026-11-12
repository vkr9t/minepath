import { useMemo, useState } from 'react';
import { buildRecommendation } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, Notice } from '../components/ui';
import { fmt0 } from '../lib/format';

export default function RecommendationTab() {
  const { activeScenario, active, mac, mc, inputs, norm, scope3T, assumptions, opts, mineLabel } = useCtx();
  const [copied, setCopied] = useState(false);

  const rec = useMemo(
    () =>
      buildRecommendation({
        scenario: activeScenario,
        result: active,
        mac,
        mc,
        includeScope3: norm.includeScope3,
        scope3T,
        demoAssumptionCount: assumptions.factors.filter((f) => f.status === 'demo_assumption').length,
        totalAssumptionCount: assumptions.factors.length,
        baseYear: opts.baseYear,
        horizonEnd: opts.horizonEnd,
        mineLabel: inputs.name || mineLabel,
        captureAvailable: norm.captureAvailable,
      }),
    [activeScenario, active, mac, mc, norm.includeScope3, norm.captureAvailable, scope3T, assumptions, opts, inputs.name, mineLabel],
  );

  const asText = () =>
    [
      `MinePath pathway recommendation: ${activeScenario.name}`,
      '',
      rec.headline,
      '',
      'Lever priorities (cheapest first):',
      ...rec.levers.map((l, i) => `${i + 1}. ${l.label}: ${l.window}, ${l.adoption}% adoption, ${l.macText}${l.note ? ` Note: ${l.note}` : ''}`),
      '',
      rec.costLine,
      rec.neutralityLine,
      rec.withoutCreditsLine ?? '',
      rec.scope3Line,
      '',
      'Key assumptions and uncertainties:',
      ...rec.assumptions.map((a) => `- ${a}`),
      '',
      rec.disclaimer,
    ]
      .filter((x) => x !== undefined)
      .join('\n');

  return (
    <div className="stack">
      <Card
        title={`Pathway recommendation: ${activeScenario.name}`}
        subtitle={`${inputs.name} · generated from the current inputs, scenario and assumptions; it updates when they change`}
        right={
          <div className="btn-row no-print">
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(asText()).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? 'Copied ✓' : 'Copy as text'}
            </button>
            <button className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
          </div>
        }
        className="rec"
      >
        <p className="lead">{rec.headline}</p>

        <h4>1. Which levers to prioritise, and in what order</h4>
        {rec.levers.length === 0 ? (
          <Notice kind="warn">No levers are enabled in this scenario. Enable levers on the Pathway tab (Scenario A or B) to get a prioritised plan.</Notice>
        ) : (
          <ol className="rec-levers">
            {rec.levers.map((l) => (
              <li key={l.lever}>
                <b>{l.label}</b> <span className="muted">· {l.window} · {l.adoption}% adoption</span>
                <div className="small">Cost per tCO₂e: {l.macText}</div>
                {l.note && <div className="small muted">{l.note}</div>}
              </li>
            ))}
          </ol>
        )}
        <p className="xsmall muted">Order = ascending marginal abatement cost, so money-saving or low-cost levers lead. Levers with a long lead time may need to start earlier than their rank suggests.</p>

        <h4>2. Cost</h4>
        <p>{rec.costLine}</p>

        <h4>3. Net-zero year and uncertainty</h4>
        <p>{rec.neutralityLine}</p>
        {rec.withoutCreditsLine && <p>{rec.withoutCreditsLine}</p>}

        <h4>4. Scope 3</h4>
        <p>{rec.scope3Line}</p>

        <h4>5. Key assumptions and uncertainties</h4>
        <ul>
          {rec.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>

        <div className="est-row">
          <Badge kind="est">All figures are estimates</Badge>
          <Badge kind="demo">Demo assumptions: {assumptions.factors.filter((f) => f.status === 'demo_assumption').length} of {assumptions.factors.length}</Badge>
          <Badge kind="info">Gross {fmt0(active.totals.gross)} · removals {fmt0(active.totals.removals)} (est.) · credits {fmt0(active.totals.credits)} tCO₂e, shown separately</Badge>
        </div>
        <Notice kind="warn">{rec.disclaimer}</Notice>
      </Card>
    </div>
  );
}
