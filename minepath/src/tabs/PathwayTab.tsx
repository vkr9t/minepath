import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeWaterfall, LEVER_KEYS, LEVER_LABELS, rangeText, type LeverKey, type LeverSetting } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, ChartTip, Legend, Notice } from '../components/ui';
import { C, LEVER_COLORS, SOURCE_COLORS, SOURCE_LABELS, SOURCE_ORDER } from '../lib/palette';
import { compact, fmt0, fmtCrore } from '../lib/format';

const LEVER_HELP: Record<LeverKey, string> = {
  ev: 'Shifts a share of diesel use to electricity. Cuts diesel but adds grid demand (Scope 2) unless paired with the PPA.',
  capture: 'Destroys a share of fugitive methane (capture rate × destruction efficiency). Needs capture to be available at the mine.',
  ppa: 'Share of purchased electricity covered by renewable supply (zero-emission factor assumed).',
  afforestation: 'Plants additional hectares on a schedule; removals follow a growth curve and are estimates.',
  credits: 'Purchases offsets. Shown separately; never counted as an emission reduction or subtracted from gross.',
};

export default function PathwayTab() {
  const {
    activeScenario,
    updateScenario,
    opts,
    norm,
    results,
    active,
    scenarios,
    mc,
    mcAll,
    params,
    costs,
    setActiveScenarioId,
  } = useCtx();
  const { baseYear, horizonEnd } = opts;
  const [wfYear, setWfYear] = useState(horizonEnd);
  const locked = activeScenario.locked;

  const patchLever = (k: LeverKey, p: Partial<LeverSetting>) =>
    updateScenario(activeScenario.id, (s) => ({ ...s, levers: { ...s.levers, [k]: { ...s.levers[k], ...p } } }));
  const clampYear = (v: number) => Math.min(horizonEnd, Math.max(baseYear, Math.round(v || baseYear)));

  const rows = active.rows;
  const stackData = rows.map((r) => ({
    year: r.year,
    ...r.sources,
    removals: -r.removals,
    credits: -r.credits,
    gross: r.gross,
  }));

  const netData = useMemo(
    () =>
      rows.map((r, i) => ({
        year: r.year,
        net: r.net,
        netExCredits: r.netExCredits,
        band: [mc.netBand[i].p10, mc.netBand[i].p90] as [number, number],
      })),
    [rows, mc],
  );

  const cumData = rows.map((r) => ({
    year: r.year,
    'Cumulative gross': r.cumGross,
    'Cumulative removals (est.)': r.cumRemovals,
    'Cumulative credits': r.cumCredits,
    'Cumulative net': r.cumNet,
  }));

  const wf = useMemo(() => {
    const steps = computeWaterfall(norm, activeScenario, params, costs, opts, wfYear);
    let run = 0;
    return steps.map((s) => {
      let start = 0;
      let end = s.value;
      if (s.kind === 'delta') {
        start = run;
        end = run + s.value;
      }
      run = end;
      return { label: s.label, value: s.value, kind: s.kind, range: [Math.min(start, end), Math.max(start, end)] as [number, number] };
    });
  }, [norm, activeScenario, params, costs, opts, wfYear]);

  const cmpData = rows.map((r, i) => {
    const o: Record<string, number> = { year: r.year };
    scenarios.forEach((s) => {
      o[s.name] = results[s.id].rows[i].net;
    });
    return o;
  });

  return (
    <div className="stack">
      <Card
        title={`Mitigation levers: ${activeScenario.name}`}
        subtitle={`Each lever starts in its start year and reaches its adoption level in the full-effect year (linear ramp), ${baseYear}–${horizonEnd}.`}
        right={
          <div className="seg small-seg" role="group" aria-label="Edit scenario">
            {scenarios.map((s) => (
              <button key={s.id} className={s.id === activeScenario.id ? 'on' : ''} onClick={() => setActiveScenarioId(s.id)}>
                {s.name.replace('Scenario ', '').replace(' (no new levers)', '')}
              </button>
            ))}
          </div>
        }
      >
        {locked && (
          <Notice kind="info">The baseline is fixed (no new levers) so every scenario has a stable reference. Pick Scenario A or B to edit levers.</Notice>
        )}
        {!locked && (
          <label className="field inline-name">
            <span className="field-label">Scenario name</span>
            <input type="text" value={activeScenario.name} onChange={(e) => updateScenario(activeScenario.id, (s) => ({ ...s, name: e.target.value }))} />
          </label>
        )}
        <div className="levers">
          {LEVER_KEYS.map((k) => {
            const l = activeScenario.levers[k];
            const unavailable = k === 'capture' && !norm.captureAvailable;
            const dis = locked;
            return (
              <div key={k} className={`lever ${l.enabled ? 'on' : ''}`} style={{ borderLeftColor: LEVER_COLORS[k] }}>
                <div className="lever-head">
                  <label className="switch">
                    <input type="checkbox" checked={l.enabled} disabled={dis} onChange={(e) => patchLever(k, { enabled: e.target.checked })} />
                    <span className="slider" />
                  </label>
                  <div>
                    <b>{LEVER_LABELS[k]}</b>
                    {unavailable && <Badge kind="warn">capture unavailable at this mine: no effect</Badge>}
                    <div className="small muted">{LEVER_HELP[k]}</div>
                  </div>
                </div>
                <div className="lever-fields">
                  <label className="mini">
                    Start year
                    <input type="number" value={l.startYear} min={baseYear} max={horizonEnd} disabled={dis || !l.enabled} onChange={(e) => patchLever(k, { startYear: clampYear(Number(e.target.value)) })} />
                  </label>
                  <label className="mini">
                    Full-effect year
                    <input type="number" value={l.rampYear} min={baseYear} max={horizonEnd} disabled={dis || !l.enabled} onChange={(e) => patchLever(k, { rampYear: clampYear(Number(e.target.value)) })} />
                  </label>
                  <label className="mini wide">
                    Adoption level: <b>{l.adoption}%</b>
                    <input type="range" min={0} max={100} step={5} value={l.adoption} disabled={dis || !l.enabled} onChange={(e) => patchLever(k, { adoption: Number(e.target.value) })} />
                  </label>
                  {k === 'afforestation' && (
                    <label className="mini">
                      Additional area at 100%
                      <span className="field-row"><input type="number" value={l.additionalHa ?? 0} min={0} disabled={dis || !l.enabled} onChange={(e) => patchLever(k, { additionalHa: Math.max(0, Number(e.target.value)) })} /><span className="unit">ha</span></span>
                    </label>
                  )}
                  {k === 'credits' && (
                    <label className="mini">
                      Volume at 100%
                      <span className="field-row"><input type="number" value={l.volume ?? 0} min={0} disabled={dis || !l.enabled} onChange={(e) => patchLever(k, { volume: Math.max(0, Number(e.target.value)) })} /><span className="unit">tCO₂e/yr</span></span>
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Annual emissions by source" subtitle="Stacked gross emissions after levers; removals and credits plotted below zero, separately">
          <Legend items={[...SOURCE_ORDER.map((s) => ({ label: SOURCE_LABELS[s], color: SOURCE_COLORS[s] })), { label: 'Removals (est.)', color: C.removals }, { label: 'Credits', color: C.credits }]} />
          <div className="chart" style={{ height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={stackData} stackOffset="sign" margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="year" stroke={C.axis} />
                <YAxis tickFormatter={compact} stroke={C.axis} />
                <Tooltip content={<ChartTip unit="tCO₂e" labelPrefix="Year " note="Removals are modelled estimates; credits are offsets, not reductions." />} />
                {SOURCE_ORDER.map((s) => (
                  <Area isAnimationActive={false} key={s} type="monotone" dataKey={s} name={SOURCE_LABELS[s]} stackId="g" stroke={SOURCE_COLORS[s]} fill={SOURCE_COLORS[s]} fillOpacity={0.85} />
                ))}
                <Area isAnimationActive={false} type="monotone" dataKey="removals" name="Removals (est.)" stackId="neg" stroke={C.removals} fill={C.removals} fillOpacity={0.6} />
                <Area isAnimationActive={false} type="monotone" dataKey="credits" name="Credits (offset)" stackId="neg" stroke={C.credits} fill={C.credits} fillOpacity={0.5} />
                <ReferenceLine y={0} stroke={C.zero} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Annual net emissions and net-zero crossing"
          subtitle={`Net = gross − removals − credits. Shaded band is the Monte Carlo P10–P90 (${mc.iterations.toLocaleString('en-IN')} runs).`}
        >
          <Legend
            items={[
              { label: 'Net (deterministic)', color: C.net },
              { label: 'Net excl. credits', color: C.gross, dashed: true },
              { label: 'P10–P90 band', color: C.band },
            ]}
          />
          <div className="chart" style={{ height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={netData} margin={{ left: 4, right: 12, top: 24 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="year" stroke={C.axis} />
                <YAxis tickFormatter={compact} stroke={C.axis} />
                <Tooltip content={<ChartTip unit="tCO₂e" labelPrefix="Year " note="Band: P10–P90 of net emissions across sampled factor and sink ranges." />} />
                <Area isAnimationActive={false} dataKey="band" name="P10–P90 band" stroke={C.bandStroke} fill={C.band} fillOpacity={0.45} />
                <Line isAnimationActive={false} dataKey="netExCredits" name="Net excl. credits" stroke={C.gross} strokeDasharray="5 4" dot={false} strokeWidth={2} />
                <Line isAnimationActive={false} dataKey="net" name="Net (deterministic)" stroke={C.net} strokeWidth={2.5} dot={false} />
                <ReferenceLine y={0} stroke={C.zero} strokeWidth={1.5} label={{ value: 'net zero', position: 'insideTopLeft', fill: C.axis, fontSize: 11 }} />
                {active.neutralityYear !== null && (
                  <ReferenceLine x={active.neutralityYear} stroke={C.removals} strokeWidth={2} label={{ value: `${active.neutralityYear}`, position: 'top', fill: C.removals, fontSize: 12, fontWeight: 700 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="small muted">
            {active.neutralityYear === null
              ? `Net emissions stay above zero through ${horizonEnd} in this scenario.`
              : `Deterministic net zero: ${active.neutralityYear}. P10–P90: ${rangeText(mc, horizonEnd)}.`}
            {active.neutralityYear !== null && active.neutralityYearExCredits === null && ' Net zero depends on credits (offsets).'}
          </p>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Cumulative emissions vs cumulative removals and credits" subtitle="Gross emissions stay visible; sinks and credits accumulate separately">
          <Legend items={[{ label: 'Cumulative gross', color: C.gross }, { label: 'Cumulative removals (est.)', color: C.removals }, { label: 'Cumulative credits', color: C.credits }, { label: 'Cumulative net', color: C.net, dashed: true }]} />
          <div className="chart" style={{ height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={cumData} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="year" stroke={C.axis} />
                <YAxis tickFormatter={compact} stroke={C.axis} />
                <Tooltip content={<ChartTip unit="tCO₂e" labelPrefix="Year " />} />
                <Line isAnimationActive={false} dataKey="Cumulative gross" stroke={C.gross} strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} dataKey="Cumulative removals (est.)" stroke={C.removals} strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} dataKey="Cumulative credits" stroke={C.credits} strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} dataKey="Cumulative net" stroke={C.net} strokeDasharray="5 4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={`Gap analysis waterfall, ${wfYear}`}
          subtitle="How baseline emissions are reduced. Levers applied in order: electrification → methane capture → PPA."
          right={
            <label className="mini inline">
              Year
              <select value={wfYear} onChange={(e) => setWfYear(Number(e.target.value))}>
                {rows.map((r) => (
                  <option key={r.year} value={r.year}>{r.year}</option>
                ))}
              </select>
            </label>
          }
        >
          <div className="chart" style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={wf} margin={{ left: 4, right: 12, top: 8, bottom: 28 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" stroke={C.axis} tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tickFormatter={compact} stroke={C.axis} />
                <Tooltip
                  content={({ active: a, payload }) => {
                    if (!a || !payload?.length) return null;
                    const p = payload[0].payload as { label: string; value: number; kind: string };
                    return (
                      <div className="tip">
                        <div className="tip-title">{p.label}</div>
                        <div className="tip-row"><span className="tip-name">{p.kind === 'total' ? 'Level' : 'Change'}</span><span className="tip-val">{p.value > 0 && p.kind === 'delta' ? '+' : ''}{fmt0(p.value)} tCO₂e</span></div>
                        <div className="tip-note">{p.label.startsWith('Removals') ? 'Estimated removals (existing + new plantings + soil if included).' : p.label.startsWith('Credits') ? 'Offsets are not reductions of gross emissions.' : 'Computed by the engine from the scenario settings.'}</div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke={C.zero} />
                <Bar isAnimationActive={false} dataKey="range" radius={[3, 3, 3, 3]}>
                  {wf.map((w, i) => (
                    <Cell key={i} fill={w.kind === 'total' ? (w.label === 'Net emissions' ? C.net : C.gross) : w.label.startsWith('Credits') ? C.credits : w.label.startsWith('Removals') ? C.removals : w.value <= 0 ? '#5a9e7f' : '#d0643a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Scenario comparison" subtitle="Baseline and both editable scenarios on the same inputs and assumptions">
        <div className="chart" style={{ height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={cmpData} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="year" stroke={C.axis} />
              <YAxis tickFormatter={compact} stroke={C.axis} />
              <Tooltip content={<ChartTip unit="tCO₂e net" labelPrefix="Year " />} />
              <ReferenceLine y={0} stroke={C.zero} />
              {scenarios.map((s, i) => (
                <Line isAnimationActive={false} key={s.id} dataKey={s.name} stroke={C.scenarios[i % C.scenarios.length]} strokeWidth={s.id === active.scenarioId ? 3.5 : 2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Legend items={scenarios.map((s, i) => ({ label: s.name, color: C.scenarios[i % C.scenarios.length] }))} />
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Scenario</th>
                <th className="num">Net-zero year</th>
                <th className="num">P10–P90</th>
                <th className="num">Not reached</th>
                <th className="num">Cumulative net (t)</th>
                <th className="num">Cost (PV)</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const r = results[s.id];
                const m = mcAll[s.id];
                return (
                  <tr key={s.id} className={s.id === active.scenarioId ? 'row-on' : ''} onClick={() => setActiveScenarioId(s.id)} style={{ cursor: 'pointer' }}>
                    <td>{s.name}</td>
                    <td className="num strong">{r.neutralityYear ?? `>${horizonEnd}`}</td>
                    <td className="num">{m ? rangeText(m, horizonEnd).replace(' to ', ' – ') : '…'}</td>
                    <td className="num">{m ? `${(m.probNotReached * 100).toFixed(0)}%` : '…'}</td>
                    <td className="num">{fmt0(r.totals.net)}</td>
                    <td className="num">{fmtCrore(r.totals.costPV)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Year-by-year detail" subtitle="Every charted value, by source, with removals, credits and cumulative totals (tCO₂e)">
        <details>
          <summary>Show table</summary>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Year</th>
                  {SOURCE_ORDER.map((s) => <th key={s} className="num">{SOURCE_LABELS[s]}</th>)}
                  <th className="num">Gross</th>
                  <th className="num">Removals (est.)</th>
                  <th className="num">Credits</th>
                  <th className="num">Net</th>
                  <th className="num">Cum. net</th>
                  <th className="num">Cost (₹ cr)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year} className={r.net <= 0 ? 'row-good' : ''}>
                    <td>{r.year}</td>
                    {SOURCE_ORDER.map((s) => <td key={s} className="num">{fmt0(r.sources[s])}</td>)}
                    <td className="num strong">{fmt0(r.gross)}</td>
                    <td className="num">{fmt0(r.removals)}</td>
                    <td className="num">{fmt0(r.credits)}</td>
                    <td className="num strong">{fmt0(r.net)}</td>
                    <td className="num">{fmt0(r.cumNet)}</td>
                    <td className="num">{(r.costTotal / 1e7).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
    </div>
  );
}
