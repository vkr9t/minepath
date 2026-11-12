import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCtx } from '../lib/context';
import { Badge, Card, ChartTip, Notice, StatusBadge } from '../components/ui';
import { C, SOURCE_COLORS } from '../lib/palette';
import { compact, fmt0, fmt3 } from '../lib/format';
import { intensityPerTonne } from '../engine';
import type { SourceKey } from '../engine';

export default function InventoryTab() {
  const { inventory, invTotals, norm, scope3T, opts, assumptions, setTab } = useCtx();
  const lo = assumptions.factors.find((f) => f.id === 'sanity_low')!.value;
  const hi = assumptions.factors.find((f) => f.id === 'sanity_high')!.value;
  const intensity = intensityPerTonne(invTotals.gross, norm.coalT);
  const inBand = intensity >= lo && intensity <= hi;

  const bars = inventory.map((l) => ({ id: l.id, name: l.label, tCO2e: l.tCO2e, range: [l.lowT, l.highT] as [number, number] }));

  return (
    <div className="stack">
      <Card title={`Emissions inventory, ${opts.baseYear} baseline (no mitigation)`} subtitle="Gross emissions only. Removals and credits are never netted off here.">
        <div className="boundary">
          <div>
            <b>Inventory boundary</b>
            <ul className="tight">
              <li><Badge kind="info">Scope 1</Badge> diesel combustion, equipment fuel, fugitive methane, explosives</li>
              <li><Badge kind="info">Scope 2</Badge> purchased electricity (location-based grid factor)</li>
              <li><Badge kind="warn">Not included</Badge> Scope 3 (downstream use of sold coal): {norm.coalT > 0 ? <>memo only, see below</> : 'n/a'}</li>
            </ul>
          </div>
          <div className="totals">
            <div><span className="muted small">Scope 1</span><b>{fmt0(invTotals.scope1)} t</b></div>
            <div><span className="muted small">Scope 2</span><b>{fmt0(invTotals.scope2)} t</b></div>
            <div className="strong"><span className="muted small">Gross Scope 1+2</span><b>{fmt0(invTotals.gross)} tCO₂e</b></div>
            <div><span className="muted small">Intensity</span><b>{fmt3(intensity)} tCO₂e / t coal</b></div>
          </div>
        </div>
        <Notice kind={inBand ? 'info' : 'warn'}>
          Validation: intensity {fmt3(intensity)} tCO₂e/t {inBand ? 'is inside' : 'is OUTSIDE'} the {lo}–{hi} tCO₂e/t plausibility band quoted in the hackathon brief (not independently verified). {inBand ? '' : 'Check units and methane intensity.'}
        </Notice>
      </Card>

      <Card title="Line items with formula, factor and source" subtitle="Every number traces to a factor in the assumptions file. Range columns use each factor's low/high.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Scope</th>
                <th className="num">Activity</th>
                <th className="num">Factor</th>
                <th>Formula</th>
                <th className="num">Result (tCO₂e)</th>
                <th className="num">Factor range (tCO₂e)</th>
                <th>Source & status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((l) => (
                <tr key={l.id}>
                  <td><span className="dot" style={{ background: SOURCE_COLORS[l.id] }} /> {l.label}</td>
                  <td>{l.scope}</td>
                  <td className="num">{fmt0(l.activityValue)} <span className="muted small">{l.activityUnit}</span><div className="muted xsmall">{l.activityLabel}</div></td>
                  <td className="num">{fmt3(l.factorValue)} <span className="muted small">{l.factorUnit}</span><div className="muted xsmall">{l.factorLabel}</div></td>
                  <td className="mono small">{l.formula}</td>
                  <td className="num strong">{fmt0(l.tCO2e)}</td>
                  <td className="num">{fmt0(l.lowT)}–{fmt0(l.highT)}</td>
                  <td className="small">
                    <StatusBadge status={l.status} />
                    <div className="xsmall muted">{l.sourceName}</div>
                    <div className="xsmall muted">factor id: <code>{l.factorId}</code></div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Gross Scope 1 + 2</td>
                <td className="num strong">{fmt0(invTotals.gross)}</td>
                <td className="num">{fmt0(invTotals.low)}–{fmt0(invTotals.high)}</td>
                <td className="small muted">sum of the lines above; ranges assume all factors at their low (or high) end together</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="small muted">
          Removals, credits and mitigation levers are applied only in the <button className="link" onClick={() => setTab('pathway')}>Pathway</button>, where gross, removals and credits stay separate.
        </p>
      </Card>

      <div className="grid-2">
        <Card title="Emissions by source" subtitle="Bars show the central estimate; the tooltip shows the factor range">
          <div className="chart" style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={bars} layout="vertical" margin={{ left: 10, right: 24 }}>
                <CartesianGrid stroke={C.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={compact} stroke={C.axis} />
                <YAxis type="category" dataKey="name" width={170} stroke={C.axis} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTip unit="tCO₂e" note="Central value uses demo-assumption factors unless marked verified." />} />
                <Bar isAnimationActive={false} dataKey="tCO2e" name="Central estimate" radius={[0, 4, 4, 0]}>
                  {bars.map((b) => (
                    <Cell key={b.id} fill={SOURCE_COLORS[b.id as SourceKey]} />
                  ))}
                </Bar>
                <Bar isAnimationActive={false} dataKey="range" name="Factor range" fill="transparent" stroke={C.bandStroke} strokeDasharray="3 3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Scope 3 (memo)" subtitle="Downstream combustion of sold coal">
          {norm.includeScope3 ? (
            <>
              <div className="big">{fmt0(scope3T)} <span className="muted small">tCO₂ / yr (estimate)</span></div>
              <p className="small">Shown for context only. It is <b>not included</b> in the Scope 1+2 inventory, the pathway or the net-zero year.</p>
            </>
          ) : (
            <>
              <div className="big">Not included</div>
              <p className="small">Scope 3 is excluded from this assessment. Enable the memo estimate on the Mine inputs tab to see an indicative figure; it still never enters the neutrality calculation.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
