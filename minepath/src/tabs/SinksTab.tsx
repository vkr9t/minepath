import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { growthCurve, sinkEnvelope, type ParamKey } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, ChartTip, Legend, Notice } from '../components/ui';
import { C } from '../lib/palette';
import { compact, fmt0, fmt2 } from '../lib/format';

export default function SinksTab() {
  const { active, norm, ranges, costs, opts, activeScenario, state, setMc, setTab, assumptions } = useCtx();
  const spread = state.mc.spread;

  const env = useMemo(() => sinkEnvelope(norm, activeScenario, ranges, costs, opts, spread), [norm, activeScenario, ranges, costs, opts, spread]);

  const data = active.rows.map((r, i) => ({
    year: r.year,
    'Existing plantation': r.forestExisting,
    'New plantings': r.forestNew,
    'Soil carbon (estimate)': r.soilRemovals,
    low: env[i].low,
    high: env[i].high,
    total: r.removals,
  }));

  // Per-hectare growth curve with envelope
  const s = Math.max(0, spread.sinks);
  const end = (k: ParamKey, which: 'low' | 'high') => {
    const r = ranges[k];
    let v = which === 'low' ? r.mode - s * (r.mode - r.low) : r.mode + s * (r.high - r.mode);
    v = Math.max(0, v);
    return v;
  };
  const curve = useMemo(() => {
    const c = growthCurve(40, ranges.cmax.mode, ranges.k.mode, ranges.p.mode);
    const lo = growthCurve(40, end('cmax', 'low'), end('k', 'low'), end('p', 'high'));
    const hi = growthCurve(40, end('cmax', 'high'), end('k', 'high'), end('p', 'low'));
    return c.map((pt, i) => ({
      age: pt.age,
      stock: pt.stock * ranges.survival.mode,
      annual: pt.annual * ranges.survival.mode,
      stockBand: [lo[i].stock * ranges.survival.low, hi[i].stock * Math.min(1, ranges.survival.high)] as [number, number],
      annualBand: [lo[i].annual * ranges.survival.low, hi[i].annual * Math.min(1, ranges.survival.high)] as [number, number],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranges, s]);

  const sinkFactors = ['sink_cmax', 'sink_k', 'sink_p', 'sink_survival', 'soil_mult']
    .map((id) => assumptions.factors.find((f) => f.id === id)!)
    .filter(Boolean);

  return (
    <div className="stack">
      <Notice kind="warn">
        <b>All removals on this page are modelled estimates, not verified sequestration.</b> They follow a growth curve (slow when young, fastest mid-life, tapering at maturity), never a constant annual value, and are always shown separately from gross emissions.
      </Notice>

      <Card
        title="Estimated removals over time"
        subtitle="Dashed lines are the low/high envelope using the unfavourable/favourable end of each sink parameter."
        right={
          <label className="mini inline">
            Confidence range ×{spread.sinks.toFixed(1)}
            <input type="range" min={0} max={3} step={0.1} value={spread.sinks} onChange={(e) => setMc({ spread: { ...spread, sinks: Number(e.target.value) } })} />
          </label>
        }
      >
        <svg width="0" height="0" aria-hidden="true">
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#dcefe5" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#2f7d5b" strokeWidth="2" />
            </pattern>
          </defs>
        </svg>
        <Legend
          items={[
            { label: 'Existing plantation', color: C.removals },
            { label: 'New plantings (afforestation lever)', color: '#58a883' },
            { label: 'Soil carbon (estimate, hatched)', color: C.soil, hatch: true },
            { label: 'Low / high envelope', color: C.bandStroke, dashed: true },
          ]}
        />
        <div className="chart" style={{ height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="year" stroke={C.axis} />
              <YAxis tickFormatter={compact} stroke={C.axis} />
              <Tooltip content={<ChartTip unit="tCO₂e" labelPrefix="Year " hide={['total']} note="Estimate. Depends on survival, growth-curve and soil-carbon assumptions." />} />
              <Area isAnimationActive={false} dataKey="Existing plantation" stackId="s" stroke={C.removals} fill={C.removals} fillOpacity={0.9} />
              <Area isAnimationActive={false} dataKey="New plantings" stackId="s" stroke="#58a883" fill="#58a883" fillOpacity={0.9} />
              <Area isAnimationActive={false} dataKey="Soil carbon (estimate)" stackId="s" stroke="#2f7d5b" fill="url(#hatch)" />
              <Line isAnimationActive={false} dataKey="low" name="Low envelope" stroke={C.bandStroke} strokeDasharray="4 4" dot={false} />
              <Line isAnimationActive={false} dataKey="high" name="High envelope" stroke={C.bandStroke} strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="small muted">
          {norm.includeSoil ? 'Soil carbon is included and flagged as a user-supplied estimate, scaled by its confidence multiplier.' : 'Soil carbon is excluded. Enable it on the Mine inputs tab (optional estimate).'}{' '}
          {fmt0(active.rows[active.rows.length - 1].removals)} tCO₂e of estimated removals in {opts.horizonEnd} (envelope {fmt0(env[env.length - 1].low)}–{fmt0(env[env.length - 1].high)}).
        </p>
      </Card>

      <div className="grid-2">
        <Card title="Growth curve per hectare" subtitle="Chapman–Richards stock and annual removal after survival (tCO₂e/ha)">
          <Legend items={[{ label: 'Annual removal (per ha)', color: C.removals }, { label: 'Stock (per ha)', color: C.net, dashed: true }, { label: 'Confidence band', color: C.band }]} />
          <div className="chart" style={{ height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={curve} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="age" stroke={C.axis} label={{ value: 'plantation age (years)', position: 'insideBottom', offset: -2, fontSize: 11, fill: C.axis }} height={42} />
                <YAxis yAxisId="a" stroke={C.axis} tickFormatter={(v: number) => v.toFixed(0)} />
                <YAxis yAxisId="s" orientation="right" stroke={C.axis} tickFormatter={(v: number) => v.toFixed(0)} />
                <Tooltip content={<ChartTip unit="tCO₂e/ha" labelPrefix="Age " format={fmt2} />} />
                <Area isAnimationActive={false} yAxisId="a" dataKey="annualBand" name="Annual removal range" stroke="none" fill={C.band} fillOpacity={0.5} />
                <Line isAnimationActive={false} yAxisId="a" dataKey="annual" name="Annual removal" stroke={C.removals} strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} yAxisId="s" dataKey="stock" name="Stock" stroke={C.net} strokeDasharray="5 4" dot={false} />
                <ReferenceLine yAxisId="a" x={norm.plantationAge} stroke={C.credits} strokeDasharray="2 3" label={{ value: 'existing plantation today', fontSize: 10, fill: C.credits, position: 'insideTopRight' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Sink assumptions" subtitle="Visible and editable in Assumptions & sources">
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th className="num">Central</th>
                  <th className="num">Low – high</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sinkFactors.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td className="num">{f.value} <span className="muted xsmall">{f.unit}</span></td>
                    <td className="num">{f.low ?? f.value} – {f.high ?? f.value}</td>
                    <td>{f.status === 'verified' ? <Badge kind="ok">verified</Badge> : <Badge kind="demo">demo assumption</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Stock(age) = Cmax · (1 − e<sup>−k·age</sup>)<sup>p</sup>; removal in a year = Stock(age+1) − Stock(age), multiplied by survival and area.{' '}
            <button className="link" onClick={() => setTab('assumptions')}>Edit assumptions</button>
          </p>
        </Card>
      </div>
    </div>
  );
}
