import { useMemo } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PARAM_GROUP, rangeText, type ParamKey, type Spread } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, ChartTip, Kpi, Legend } from '../components/ui';
import { C } from '../lib/palette';
import { compact, fmt0 } from '../lib/format';

const PARAM_LABELS: Record<ParamKey, string> = {
  efDiesel: 'Diesel emission factor',
  efGrid: 'Grid emission factor',
  efExplosives: 'Explosives factor',
  scope3Ef: 'Scope 3 coal factor (memo)',
  gridDecline: 'Grid decline per year',
  evKwhPerL: 'Electricity per litre displaced',
  evMaxShare: 'Max electrifiable share',
  ch4Intensity: 'Methane intensity',
  gwp: 'Methane GWP',
  destruction: 'Capture destruction efficiency',
  cmax: 'Plantation stock at maturity',
  k: 'Growth rate k',
  p: 'Growth shape p',
  survival: 'Survival rate',
  soilMult: 'Soil-carbon multiplier',
};

const GROUPS: { key: keyof Spread; label: string; help: string }[] = [
  { key: 'factors', label: 'Emission-factor uncertainty', help: 'Diesel, grid, explosives and lever-physics factors' },
  { key: 'methane', label: 'Methane assumptions', help: 'Methane intensity, GWP and capture destruction efficiency' },
  { key: 'sinks', label: 'Sink-rate uncertainty', help: 'Growth curve, survival and soil-carbon confidence' },
];

export default function UncertaintyTab() {
  const { mc, mcMs, mcPending, state, setMc, opts, active, ranges, setTab, activeScenario } = useCtx();
  const { spread, iterations, seed } = state.mc;
  const { horizonEnd } = opts;

  const hist = useMemo(
    () => [...mc.histogram.map((h) => ({ label: String(h.year), count: h.count, year: h.year })), { label: `>${horizonEnd}`, count: mc.beyondCount, year: Infinity }],
    [mc, horizonEnd],
  );

  const cum = mc.cumNetBand.map((b, i) => ({
    year: b.year,
    band: [b.p10, b.p90] as [number, number],
    p50: b.p50,
    deterministic: active.rows[i].cumNet,
  }));
  const gross = mc.grossBand.map((b, i) => ({ year: b.year, band: [b.p10, b.p90] as [number, number], p50: b.p50, deterministic: active.rows[i].gross }));

  const detLabel = mc.deterministicYear === null ? `>${horizonEnd}` : String(mc.deterministicYear);

  return (
    <div className="stack">
      <div className="kpis kpis-4">
        <Kpi label="Deterministic net-zero year" value={detLabel} sub="all parameters at central values" />
        <Kpi label="P10 (optimistic)" value={mc.p10 ?? `>${horizonEnd}`} sub="10% of runs reach net zero by then" tone="band" />
        <Kpi label="P50 (median)" value={mc.p50 ?? `>${horizonEnd}`} sub={`${iterations.toLocaleString('en-IN')} runs, seed ${seed}`} tone="band" />
        <Kpi label="P90 (cautious)" value={mc.p90 ?? `>${horizonEnd}`} sub={`${(mc.probNotReached * 100).toFixed(0)}% of runs not reached by ${horizonEnd}`} tone="band" />
      </div>

      <Card
        title="Monte Carlo settings"
        subtitle={`${activeScenario.name}: parameters are sampled once per run from triangular distributions (low / central / high from the assumptions file).`}
        right={<span className="muted small">{mcPending ? 'recomputing…' : `${mcMs.toFixed(0)} ms for all scenarios`}</span>}
      >
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Iterations</span>
            <select value={iterations} onChange={(e) => setMc({ iterations: Number(e.target.value) })}>
              {[200, 500, 1000, 2000, 5000].map((n) => (
                <option key={n} value={n}>{n.toLocaleString('en-IN')}</option>
              ))}
            </select>
            <span className="hint">1,000 is a good demo default; 5,000 gives smoother percentiles.</span>
          </label>
          <label className="field">
            <span className="field-label">Random seed</span>
            <span className="field-row">
              <input type="number" value={seed} onChange={(e) => setMc({ seed: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              <button className="btn" onClick={() => setMc({ seed: Math.floor(Math.random() * 1e6) })}>New seed</button>
            </span>
            <span className="hint">Same seed + same inputs gives identical results.</span>
          </label>
          {GROUPS.map((g) => (
            <label key={g.key} className="field">
              <span className="field-label">{g.label}: ×{spread[g.key].toFixed(1)}</span>
              <input type="range" min={0} max={3} step={0.1} value={spread[g.key]} onChange={(e) => setMc({ spread: { ...spread, [g.key]: Number(e.target.value) } })} />
              <span className="hint">{g.help}. ×1 = ranges as configured, ×0 = no uncertainty, ×3 = three times wider.</span>
            </label>
          ))}
        </div>
        <button className="btn" onClick={() => setMc({ spread: { factors: 1, methane: 1, sinks: 1 } })}>Reset ranges to ×1</button>
      </Card>

      <div className="grid-2">
        <Card title="Distribution of the net-zero year" subtitle={`Deterministic: ${detLabel}. Simulated P10–P90: ${rangeText(mc, horizonEnd)}.`}>
          <div className="chart" style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={hist} margin={{ left: 4, right: 12, top: 24 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" stroke={C.axis} tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={50} />
                <YAxis stroke={C.axis} label={{ value: 'runs', angle: -90, position: 'insideLeft', fontSize: 11, fill: C.axis }} />
                <Tooltip content={<ChartTip unit="runs" labelPrefix="Net zero in " note="Last bar = net zero not reached within the horizon." />} />
                {mc.deterministicYear !== null && <ReferenceLine x={String(mc.deterministicYear)} stroke={C.net} strokeWidth={2} label={{ value: 'deterministic', fontSize: 11, position: 'top', fill: C.net }} />}
                <Bar isAnimationActive={false} dataKey="count" name="Runs">
                  {hist.map((h, i) => {
                    const inBand = mc.p10 !== null && h.year >= mc.p10 && (mc.p90 === null ? true : h.year <= mc.p90);
                    return <Cell key={i} fill={h.year === Infinity ? '#b9b3a6' : inBand ? C.bandStroke : '#c9d6e2'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: 'Within P10–P90', color: C.bandStroke }, { label: 'Outside', color: '#c9d6e2' }, { label: 'Not reached', color: '#b9b3a6' }]} />
        </Card>

        <Card title="Cumulative net emissions: uncertainty band" subtitle="P10–P90 across runs, with the median and the deterministic path">
          <Legend items={[{ label: 'P10–P90 band', color: C.band }, { label: 'Median (P50)', color: C.bandStroke, dashed: true }, { label: 'Deterministic', color: C.net }]} />
          <div className="chart" style={{ height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={cum} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="year" stroke={C.axis} />
                <YAxis tickFormatter={compact} stroke={C.axis} />
                <Tooltip content={<ChartTip unit="tCO₂e" labelPrefix="Year " note="Cumulative net = gross − removals (est.) − credits since the base year." />} />
                <Area isAnimationActive={false} dataKey="band" name="P10–P90" stroke={C.bandStroke} fill={C.band} fillOpacity={0.5} />
                <Line isAnimationActive={false} dataKey="p50" name="Median" stroke={C.bandStroke} strokeDasharray="5 4" dot={false} strokeWidth={2} />
                <Line isAnimationActive={false} dataKey="deterministic" name="Deterministic" stroke={C.net} dot={false} strokeWidth={2.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Annual gross emissions: uncertainty band" subtitle="Shows how much of the spread comes from the emission inventory itself">
        <div className="chart" style={{ height: 240 }}>
          <ResponsiveContainer>
            <ComposedChart data={gross} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="year" stroke={C.axis} />
              <YAxis tickFormatter={compact} stroke={C.axis} />
              <Tooltip content={<ChartTip unit="tCO₂e" labelPrefix="Year " />} />
              <Area isAnimationActive={false} dataKey="band" name="P10–P90" stroke={C.bandStroke} fill={C.band} fillOpacity={0.5} />
              <Line isAnimationActive={false} dataKey="deterministic" name="Deterministic" stroke={C.gross} dot={false} strokeWidth={2.5} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="Sampled parameter ranges"
        subtitle="Low / central / high that feed the simulation at the current multipliers. Edit the underlying ranges in Assumptions & sources."
        right={<button className="btn" onClick={() => setTab('assumptions')}>Edit ranges</button>}
      >
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Group</th>
                <th className="num">Low</th>
                <th className="num">Central</th>
                <th className="num">High</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(ranges) as ParamKey[]).map((k) => {
                const r = ranges[k];
                const s = spread[PARAM_GROUP[k]];
                const lo = Math.max(0, r.mode - s * (r.mode - r.low));
                const hi = r.mode + s * (r.high - r.mode);
                const wide = hi - lo > 0;
                return (
                  <tr key={k}>
                    <td>{PARAM_LABELS[k]}</td>
                    <td><Badge kind="info">{PARAM_GROUP[k]}</Badge></td>
                    <td className="num">{+lo.toPrecision(4)}</td>
                    <td className="num strong">{+r.mode.toPrecision(4)}</td>
                    <td className="num">{wide ? +hi.toPrecision(4) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="xsmall muted">Fractions are capped at 100%. {fmt0(mc.iterations)} runs; methane intensity is typically the dominant source of spread, especially for underground mines.</p>
      </Card>
    </div>
  );
}
