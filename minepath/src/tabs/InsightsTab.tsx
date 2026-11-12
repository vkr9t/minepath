import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { creditDependence, runSensitivity, type ParamKey } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, ChartTip, Kpi, Legend, Notice } from '../components/ui';
import { C } from '../lib/palette';
import { compact, fmt0 } from '../lib/format';

const LABELS: Record<ParamKey, string> = {
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

const GRADE_TEXT = {
  strong: { kind: 'ok' as const, text: 'Mostly real cuts: credits are under 20% of remaining emissions.' },
  moderate: { kind: 'warn' as const, text: 'Credit-assisted: credits are 20–50% of remaining emissions.' },
  weak: { kind: 'err' as const, text: 'Credit-dependent: credits are over 50% of remaining emissions. A buyer or auditor will question this "net zero".' },
  'n/a': { kind: 'info' as const, text: 'No remaining emissions to offset.' },
};

export default function InsightsTab() {
  const { norm, activeScenario, ranges, costs, opts, results, active, assumptions, setTab } = useCtx();
  const sens = useMemo(() => runSensitivity(norm, activeScenario, ranges, costs, opts), [norm, activeScenario, ranges, costs, opts]);
  const baseline = results['baseline'];
  const yearChoices = active.rows.map((r) => r.year);
  const defaultYear = active.neutralityYear ?? opts.horizonEnd;
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const year = pickedYear !== null && yearChoices.includes(pickedYear) ? pickedYear : defaultYear;
  const dep = useMemo(() => (baseline ? creditDependence(active, baseline, year) : null), [active, baseline, year]);

  const data = sens.rows.slice(0, 10).map((r) => ({
    name: LABELS[r.key],
    lowDelta: r.cumNetLow - sens.centralCumNet,
    highDelta: r.cumNetHigh - sens.centralCumNet,
    range: `${+r.low.toPrecision(3)} – ${+r.high.toPrecision(3)}`,
    yearLow: r.yearLow,
    yearHigh: r.yearHigh,
  }));
  const demoKeys = new Set(assumptions.factors.filter((f) => f.status === 'demo_assumption').map((f) => f.id));
  const top = sens.rows[0];

  const parts = dep
    ? [
        { label: 'Real reductions', v: dep.shareReductions, color: '#3d6f9e' },
        { label: 'Removals (est.)', v: dep.shareRemovals, color: C.removals },
        { label: 'Credits', v: dep.shareCredits, color: C.credits },
        { label: 'Still emitted', v: dep.shareUnclosed, color: C.gross },
      ]
    : [];

  return (
    <div className="stack">
      <div className="kpis kpis-4">
        <Kpi label="Biggest driver of the result" value={top ? LABELS[top.key] : '–'} sub="largest swing in cumulative net emissions" tone="band" />
        <Kpi label="Cumulative net, central" value={`${compact(sens.centralCumNet)} t`} sub={`${opts.baseYear}–${opts.horizonEnd}, ${activeScenario.name}`} />
        <Kpi label="Credits ÷ remaining gross" value={dep ? `${(dep.creditShareOfResidual * 100).toFixed(0)}%` : '–'} sub={`in ${year}`} tone={dep?.grade === 'weak' ? 'bad' : dep?.grade === 'strong' ? 'good' : 'default'} />
        <Kpi label="Net-zero integrity" value={dep ? dep.grade : '–'} sub="rule of thumb in this tool, not a standard" />
      </div>

      <Card
        title="Net-zero integrity: what closes the gap?"
        subtitle="Compares this scenario with the no-lever baseline in one year. Real cuts, removals and credits are kept apart."
        right={
          <label className="small">
            Year{' '}
            <select value={year} onChange={(e) => setPickedYear(Number(e.target.value))}>
              {yearChoices.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        }
      >
        {dep && (
          <>
            <div className="stackbar" role="img" aria-label="Share of baseline emissions closed by each mechanism">
              {parts.map((p) => (
                <div key={p.label} style={{ width: `${Math.max(0, Math.min(100, p.v * 100))}%`, background: p.color }} title={`${p.label}: ${(p.v * 100).toFixed(1)}%`} />
              ))}
            </div>
            <Legend items={parts.map((p) => ({ label: `${p.label}: ${(p.v * 100).toFixed(0)}%`, color: p.color }))} />
            <p className="small">
              In {year}, baseline gross is {fmt0(dep.baselineGross)} tCO₂e. This scenario cuts {fmt0(dep.reductions)}, removes about {fmt0(dep.removals)} (est.) and buys {fmt0(dep.credits)} credits; {fmt0(dep.residualGross)} tCO₂e is still emitted.
            </p>
            <Notice kind={dep.grade === 'strong' || dep.grade === 'n/a' ? 'info' : 'warn'}>{GRADE_TEXT[dep.grade].text}</Notice>
          </>
        )}
      </Card>

      <Card
        title="What moves the answer most? (sensitivity)"
        subtitle="Each parameter is pushed to its low and high value while the rest stay central. Bars show the change in cumulative net emissions over the horizon."
      >
        <div className="chart" style={{ height: 380 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 40, top: 8 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={compact} stroke={C.axis} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 12 }} stroke={C.axis} />
              <Tooltip content={<ChartTip unit="tCO₂e vs central" />} />
              <ReferenceLine x={0} stroke={C.zero} />
              <Bar isAnimationActive={false} dataKey="lowDelta" name="Parameter at low" fill="#3d6f9e" />
              <Bar isAnimationActive={false} dataKey="highDelta" name="Parameter at high" fill="#c2711a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Parameter at its low value', color: '#3d6f9e' }, { label: 'Parameter at its high value', color: '#c2711a' }]} />
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr><th>Parameter</th><th className="num">Low – high</th><th className="num">Net-zero year at low</th><th className="num">at high</th><th className="num">Swing (t)</th></tr>
            </thead>
            <tbody>
              {sens.rows.map((r) => (
                <tr key={r.key}>
                  <td>{LABELS[r.key]}</td>
                  <td className="num">{+r.low.toPrecision(3)} – {+r.high.toPrecision(3)}</td>
                  <td className="num">{r.yearLow ?? `>${opts.horizonEnd}`}</td>
                  <td className="num">{r.yearHigh ?? `>${opts.horizonEnd}`}</td>
                  <td className="num strong">{fmt0(r.swing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xsmall muted">
          Read this as "where is better data worth the most". {demoKeys.size} of {assumptions.factors.length} factors are still demo assumptions; verify the top rows first.{' '}
          <button className="link" onClick={() => setTab('assumptions')}>Open assumptions</button>
        </p>
        {top && <Badge kind="info">Top driver: {LABELS[top.key]}</Badge>}
      </Card>
    </div>
  );
}
