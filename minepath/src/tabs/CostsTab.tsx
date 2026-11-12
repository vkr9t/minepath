import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEVER_KEYS, LEVER_LABELS } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, ChartTip, Legend, Notice } from '../components/ui';
import { C, LEVER_COLORS } from '../lib/palette';
import { compact, fmt0, fmt2, fmtCrore, fmtInr } from '../lib/format';

export default function CostsTab() {
  const { mac, active, activeScenario, assumptions, patchFactor, opts, setTab } = useCtx();

  // Cap outlier bars so one extreme lever does not flatten the rest; the label keeps the true value.
  const vals = mac.filter((m) => m.macPerT !== null).map((m) => Math.abs(m.macPerT as number)).sort((a, b) => b - a);
  const cap = vals.length > 1 ? Math.max(vals[1] * 2.2, 1) : Infinity;
  const macData = mac
    .filter((m) => m.macPerT !== null)
    .map((m) => {
      const v = m.macPerT as number;
      return { lever: m.lever, name: m.label, value: v, shown: Math.max(-cap, Math.min(cap, v)), clipped: Math.abs(v) > cap, enabled: activeScenario.levers[m.lever].enabled };
    });
  const notAbating = mac.filter((m) => m.macPerT === null);

  const costData = active.rows.map((r) => ({ year: r.year, ...r.costs }));
  const costFactors = assumptions.factors.filter((f) => f.category === 'Cost');

  return (
    <div className="stack">
      <Notice kind="demo">
        <b>All costs are demo assumptions</b> (placeholders), not quotes or benchmarks. Edit them below; every chart and the ranking update. Costs exclude financing, taxes and inflation.
      </Notice>

      <div className="grid-2">
        <Card
          title="Marginal abatement cost ranking"
          subtitle="Levelised ₹ per tCO₂e abated, each lever evaluated alone vs a no-lever baseline. Cheapest first; negative = net saving."
        >
          <div className="chart" style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={macData} layout="vertical" margin={{ left: 10, right: 40 }}>
                <CartesianGrid stroke={C.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={compact} stroke={C.axis} domain={['auto', 'auto']} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12 }} stroke={C.axis} />
                <Tooltip
                  content={({ active: a, payload }) => {
                    if (!a || !payload?.length) return null;
                    const p = payload[0].payload as (typeof macData)[number];
                    return (
                      <div className="tip">
                        <div className="tip-title">{p.name}</div>
                        <div className="tip-row"><span className="tip-name">MAC</span><span className="tip-val">{fmtInr(p.value)} / tCO₂e</span></div>
                        <div className="tip-note">{p.enabled ? 'Enabled in this scenario.' : 'Not enabled in this scenario; evaluated with its saved settings.'}{p.clipped ? ' Bar clipped for readability.' : ''} Cost inputs are demo assumptions.</div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={0} stroke={C.zero} />
                <Bar isAnimationActive={false} dataKey="shown" name="MAC" radius={[0, 4, 4, 0]}>
                  {macData.map((d) => (
                    <Cell key={d.lever} fill={d.value < 0 ? C.removals : LEVER_COLORS[d.lever]} fillOpacity={d.enabled ? 1 : 0.45} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    fontSize={11}
                    formatter={(v: number) => `${fmtInr(v)}${Math.abs(v) > cap ? ' ▶' : ''}`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="small muted">Faded bars are levers switched off in this scenario. Interactions between levers (e.g. an electric fleet needs the PPA to cut emissions) are not captured in the isolated ranking.</p>
        </Card>

        <Card title="Lever costs and abatement" subtitle={`${activeScenario.name}, ${opts.baseYear}–${opts.horizonEnd}`}>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Lever</th>
                  <th className="num">Cost (nominal)</th>
                  <th className="num">Cost (PV)</th>
                  <th className="num">Abated (cum.)</th>
                  <th className="num">MAC ₹/tCO₂e</th>
                </tr>
              </thead>
              <tbody>
                {mac.map((m) => (
                  <tr key={m.lever} className={activeScenario.levers[m.lever].enabled ? '' : 'faded'}>
                    <td><span className="dot" style={{ background: LEVER_COLORS[m.lever] }} /> {m.label}{!activeScenario.levers[m.lever].enabled && <span className="muted xsmall"> (off)</span>}</td>
                    <td className="num">{fmtCrore(m.costNominal)}</td>
                    <td className="num">{fmtCrore(m.costPV)}</td>
                    <td className="num">{fmt0(m.abatedT)} t</td>
                    <td className="num strong">{m.macPerT === null ? 'n/a' : fmtInr(m.macPerT)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Scenario total (levers combined)</td>
                  <td className="num">{fmtCrore(active.totals.costNominal)}</td>
                  <td className="num">{fmtCrore(active.totals.costPV)}</td>
                  <td className="num">{fmt0(Math.max(0, mac.filter((m) => activeScenario.levers[m.lever].enabled).reduce((s, m) => s + m.abatedT, 0)))} t*</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {notAbating.length > 0 && (
            <p className="small muted">
              n/a: {notAbating.map((m) => m.label).join(', ')} abate nothing here (for example capture is unavailable, or an electric fleet draws as much grid emissions as the diesel it saves).
            </p>
          )}
          <p className="xsmall muted">* sum of isolated lever abatement for enabled levers; combined effects differ slightly because levers interact.</p>
        </Card>
      </div>

      <Card title="Annual cost by lever" subtitle="Capex + operating cost − savings, in ₹ crore. Negative bars are net savings (e.g. avoided diesel).">
        <Legend items={LEVER_KEYS.map((k) => ({ label: LEVER_LABELS[k], color: LEVER_COLORS[k] }))} />
        <div className="chart" style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={costData} stackOffset="sign" margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="year" stroke={C.axis} />
              <YAxis tickFormatter={(v: number) => `${(v / 1e7).toFixed(0)}`} stroke={C.axis} label={{ value: '₹ crore', angle: -90, position: 'insideLeft', fontSize: 11, fill: C.axis }} />
              <Tooltip content={<ChartTip labelPrefix="Year " unit="" format={(v) => `₹${fmt2(v / 1e7)} cr`} note="Demo-assumption costs." />} />
              <ReferenceLine y={0} stroke={C.zero} />
              {LEVER_KEYS.map((k) => (
                <Bar isAnimationActive={false} key={k} dataKey={k} name={LEVER_LABELS[k]} stackId="c" fill={LEVER_COLORS[k]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Cost assumptions (editable)" subtitle="Changing a value recalculates immediately. Mark verified in Assumptions & sources once replaced with a sourced value.">
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Assumption</th>
                <th className="num">Value</th>
                <th>Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {costFactors.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}<div className="xsmall muted">{f.notes}</div></td>
                  <td className="num">
                    <input
                      className="cell-input"
                      type="number"
                      step="any"
                      value={f.value}
                      onChange={(e) => e.target.value !== '' && patchFactor(f.id, { value: Number(e.target.value) })}
                      aria-label={f.name}
                    />
                  </td>
                  <td className="small">{f.unit}</td>
                  <td>{f.status === 'verified' ? <Badge kind="ok">verified</Badge> : <Badge kind="demo" title="demo assumption—replace with a verified factor">demo assumption</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Full source details are on <button className="link" onClick={() => setTab('assumptions')}>Assumptions & sources</button>.
        </p>
      </Card>
    </div>
  );
}
