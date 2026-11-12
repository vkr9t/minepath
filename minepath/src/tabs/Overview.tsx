import { useMemo, useState } from 'react';
import { rangeText, yearText } from '../engine';
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  computeInventory,
  inventoryTotals,
  resolveCosts,
  resolveParams,
  resolveRanges,
  simulateScenario,
  validateInputs,
  type MineType,
  type SourceKey,
} from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, ChartTip, Legend } from '../components/ui';
import { C, SOURCE_COLORS, SOURCE_LABELS, SOURCE_ORDER } from '../lib/palette';
import { fmt0, fmt3 } from '../lib/format';
import type { TabId } from '../lib/state';

export default function Overview() {
  const { state, assumptions, opts, setTab, setMineType, startGuide, invTotals, inventory, active, results, mc, mcPending, norm, validation, activeScenario, mineType } = useCtx();
  const [open, setOpen] = useState<string | null>(null);

  const compare = useMemo(() => {
    return (['opencast', 'underground'] as MineType[]).map((t) => {
      const m = state.mines[t];
      const v = validateInputs(m.inputs);
      const params = resolveParams(assumptions, v.normalized);
      const ranges = resolveRanges(assumptions, v.normalized);
      const inv = computeInventory(v.normalized, params, assumptions, ranges);
      const tot = inventoryTotals(inv);
      const coal = v.normalized.coalT || 1;
      const sc = m.scenarios.find((s) => s.id === 'aggressive') ?? m.scenarios[m.scenarios.length - 1];
      const sim = simulateScenario(v.normalized, sc, params, resolveCosts(assumptions), opts);
      const row: Record<string, number | string> = {
        name: t === 'opencast' ? 'Open-cast' : 'Underground',
        gross: tot.gross,
        intensity: tot.gross / coal,
      };
      inv.forEach((l) => {
        row[l.id] = l.tCO2e;
        row[`${l.id}_pct`] = tot.gross > 0 ? (l.tCO2e / tot.gross) * 100 : 0;
        row[`${l.id}_int`] = l.tCO2e / coal;
      });
      return { t, row, tot, methaneShare: tot.gross > 0 ? (inv.find((l) => l.id === 'methane')!.tCO2e / tot.gross) * 100 : 0, sim, scName: sc.name, coal: v.normalized.coalT };
    });
  }, [state.mines, assumptions, opts]);

  const lo = assumptions.factors.find((f) => f.id === 'sanity_low')!.value;
  const hi = assumptions.factors.find((f) => f.id === 'sanity_high')!.value;

  const shareData = compare.map((c) => {
    const o: Record<string, number | string> = { name: c.row.name as string };
    SOURCE_ORDER.forEach((s) => (o[s] = c.row[`${s}_pct`] as number));
    return o;
  });
  const intData = compare.map((c) => {
    const o: Record<string, number | string> = { name: c.row.name as string };
    SOURCE_ORDER.forEach((s) => (o[s] = c.row[`${s}_int`] as number));
    return o;
  });

  const demoCount = assumptions.factors.filter((f) => f.status === 'demo_assumption').length;
  const verifiedCount = assumptions.factors.length - demoCount;
  const errs = validation.issues.filter((i) => i.level === 'error').length;
  const leversOn = (Object.values(activeScenario.levers) as { enabled: boolean }[]).filter((l) => l.enabled).length;
  const baseline = results['baseline'];
  const lastA = active.rows[active.rows.length - 1];
  const lastB = baseline ? baseline.rows[baseline.rows.length - 1] : lastA;
  const funnel = [
    { label: `Gross emissions in ${opts.horizonEnd} with no action`, v: lastB.gross, color: '#9c2f3b', tag: 'Emitted' },
    { label: 'After your reduction levers', v: lastA.gross, color: '#c2711a', tag: 'Emitted' },
    { label: 'Taken back by land and soil (est.)', v: lastA.removals, color: '#2f7d5b', tag: 'Removed' },
    { label: 'Covered by bought credits', v: lastA.credits, color: '#7d5ba6', tag: 'Credits' },
  ];
  const funMax = Math.max(1, ...funnel.map((f) => f.v));
  const dieselTotal = norm.dieselL + norm.equipmentL;

  const stages: { id: string; label: string; tech: string; status: string; ok: boolean; key: string; tab: 'inputs' | 'inventory' | 'pathway' | 'sinks' | 'uncertainty' | 'recommendation'; inputs: string; formula: string; assumptionsText: string; sources: string }[] = [
    {
      id: 'data', label: 'Mine activity data', tech: 'Inputs', ok: errs === 0, status: errs === 0 ? 'Inputs complete' : `${errs} input${errs > 1 ? 's' : ''} to fix`,
      key: `${fmt0(norm.coalT)} t coal / year`, tab: 'inputs',
      inputs: `Coal ${fmt0(norm.coalT)} t · diesel ${fmt0(dieselTotal)} L · electricity ${fmt0(norm.electricityKWh)} kWh · explosives ${fmt0(norm.explosivesKg / 1000)} t`,
      formula: 'Everything is converted to base units (tonnes, litres, kWh) before any calculation.',
      assumptionsText: 'Unit conversions and plausibility checks only. No emission factors are used yet.', sources: 'You (or the sample mine).',
    },
    {
      id: 'emis', label: 'Emissions estimate', tech: 'Scope 1 + 2', ok: norm.coalT > 0, status: norm.coalT > 0 ? 'Scope 1 and 2 calculated' : 'Needs coal output',
      key: `${fmt0(invTotals.gross)} t CO₂e / year`, tab: 'inventory',
      inputs: inventory.map((l) => `${l.label}: ${fmt0(l.tCO2e)} t`).join(' · '),
      formula: 'Emissions = activity × emission factor. Methane is converted to CO₂e with its 100-year warming potential.',
      assumptionsText: `${verifiedCount} of ${assumptions.factors.length} factors are verified; the rest are demo values.`,
      sources: Array.from(new Set(inventory.map((l) => `${l.label}: ${l.status === 'verified' ? l.sourceName : 'demo assumption'}`))).join(' · '),
    },
    {
      id: 'plan', label: 'Reduction plan', tech: 'Levers', ok: leversOn > 0, status: leversOn > 0 ? `${leversOn} lever${leversOn > 1 ? 's' : ''} active` : 'No levers switched on',
      key: `${fmt0(lastA.gross)} t CO₂e in ${opts.horizonEnd}`, tab: 'pathway',
      inputs: `${activeScenario.name}: each lever has a start year, a full-effect year and a share adopted.`,
      formula: 'A lever phases in evenly between its start year and full-effect year, then holds.',
      assumptionsText: 'Electric fleet, methane capture and renewable power efficiencies come from the factor list.', sources: 'Assumptions & sources page.',
    },
    {
      id: 'sinks', label: 'Land and soil removals', tech: 'Carbon sinks', ok: lastA.removals > 0, status: lastA.removals > 0 ? 'Removals estimated' : 'No removals yet',
      key: `${fmt0(active.totals.removals)} t CO₂e over ${opts.baseYear}–${opts.horizonEnd} (est.)`, tab: 'sinks',
      inputs: 'Hectares reclaimed and planted, plantation age, optional soil carbon.',
      formula: 'Each planting cohort follows a growth curve; yearly removal is the change in stored carbon × survival rate.',
      assumptionsText: 'Growth curve, survival and soil multiplier are demo values unless marked verified.', sources: 'Assumptions & sources page.',
    },
    {
      id: 'unc', label: 'Uncertainty range', tech: 'Monte Carlo P10–P90', ok: true, status: mcPending ? 'Updating…' : `${mc.iterations.toLocaleString('en-IN')} runs`,
      key: `${rangeText(mc, opts.horizonEnd).replace(' to ', ' – ')}`, tab: 'uncertainty',
      inputs: 'Low, central and high value of every uncertain factor.',
      formula: 'Each run draws one value per factor, replays the whole model, and records the net-zero year. P10–P90 is the middle 80% of runs.',
      assumptionsText: 'Ranges are the low/high columns of the factor list.', sources: 'Assumptions & sources page.',
    },
    {
      id: 'rec', label: 'Recommended pathway', tech: 'Report', ok: active.neutralityYear !== null, status: active.neutralityYear !== null ? 'Pathway ready' : 'Not net zero yet',
      key: `Net zero: ${yearText(active.neutralityYear, opts.horizonEnd)}`, tab: 'recommendation',
      inputs: 'All of the above.',
      formula: 'Net = gross − removals − credits. Net zero is the first year net is zero or below. A second figure excludes credits.',
      assumptionsText: active.neutralityYearExCredits === null && active.neutralityYear !== null ? 'This plan needs bought credits to reach net zero.' : 'Reached without relying on credits.',
      sources: 'Generated from your numbers.',
    },
  ];

  return (
    <div className="stack">
      <section className="hero" aria-labelledby="hero-h">
        <svg className="hero-art" viewBox="0 0 600 400" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <path key={i} d={`M-20 ${330 - i * 36} C 120 ${290 - i * 40}, 220 ${380 - i * 30}, 340 ${300 - i * 34} S 520 ${260 - i * 30}, 640 ${300 - i * 36}`} fill="none" stroke="#22d3ee" strokeOpacity={0.08 + i * 0.03} strokeWidth="1.5" />
          ))}
        </svg>
        <div className="hero-main">
          <div className="eyebrow light">Carbon planning for coal mines</div>
          <h1 id="hero-h">Map your mine’s road to <span className="hl">net zero.</span></h1>
          <p className="hero-sub">Enter what your mine uses. MinePath counts its emissions, tests ways to cut them, and shows a range of likely net-zero years instead of one guess.</p>
          <div className="seg dark" role="group" aria-label="Choose your mine type">
            {(['opencast', 'underground'] as const).map((m) => (
              <button key={m} className={mineType === m ? 'on' : ''} aria-pressed={mineType === m} onClick={() => setMineType(m)}>
                {m === 'opencast' ? 'Open-cast mine' : 'Underground mine'}
              </button>
            ))}
          </div>
          <div className="hero-cta">
            <button className="btn cta" onClick={() => setTab('inputs')}>Build my pathway <span aria-hidden="true">→</span></button>
            <button className="btn ghost" onClick={startGuide}>▶ Take the 3-minute tour</button>
            <button className="btn ghost" onClick={() => setTab('assumptions')}>View assumptions</button>
          </div>
        </div>
        <aside className="hero-card" aria-label="Current estimate for the selected mine">
          <div className="hc-label">{mineType === 'underground' ? 'Underground sample mine' : 'Open-cast sample mine'}</div>
          <div className="hc-big">{fmt0(invTotals.gross)}</div>
          <div className="hc-unit">tonnes CO₂e per year (Scope 1 + 2)</div>
          <dl className="hc-list">
            <div><dt>Net zero (this plan)</dt><dd>{yearText(active.neutralityYear, opts.horizonEnd)}</dd></div>
            <div><dt>Likely range (P10–P90)</dt><dd>{rangeText(mc, opts.horizonEnd).replace(' to ', ' – ')}</dd></div>
            <div><dt>Not reached by {opts.horizonEnd}</dt><dd>{(mc.probNotReached * 100).toFixed(0)}% of runs</dd></div>
          </dl>
          <div className="hc-trust">
            <span className="trust-ok">{verifiedCount} verified</span>
            <span className="trust-demo">{demoCount} demo values</span>
          </div>
        </aside>
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[0, 1].map((k) => (
            <span key={k}>SCOPE 1 ★ SCOPE 2 ★ METHANE ★ LEVERS ★ LAND &amp; SOIL ★ P10–P90 ★ NET ZERO ★ SCOPE 1 ★ SCOPE 2 ★ METHANE ★ LEVERS ★ LAND &amp; SOIL ★ P10–P90 ★ NET ZERO ★ </span>
          ))}
        </div>
      </div>

      <Card title="From your data to a recommendation" subtitle="Six stages. Each shows its live status and key result. Select a stage to see its inputs, formula, assumptions and sources.">
        <ol className="pipe">
          {stages.map((s, i) => (
            <li key={s.id} className={`pipe-item ${open === s.id ? 'open' : ''}`}>
              <button className={`pipe-stage ${s.ok ? 'ok' : 'warn'}`} aria-expanded={open === s.id} aria-controls={`pipe-${s.id}`} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className="pipe-n" aria-hidden="true">{i + 1}</span>
                <span className="pipe-label">{s.label}</span>
                <span className="pipe-tech">{s.tech}</span>
                <span className="pipe-key">{s.key}</span>
                <span className="pipe-status">{s.ok ? '✓' : '!'} {s.status}</span>
              </button>
            </li>
          ))}
        </ol>
        {open && (() => {
          const s = stages.find((x) => x.id === open)!;
          return (
            <div id={`pipe-${s.id}`} className="pipe-detail" role="region" aria-label={`${s.label} details`}>
              <h4>{s.label} <span className="muted small">({s.tech})</span></h4>
              <dl>
                <dt>What goes in</dt><dd>{s.inputs}</dd>
                <dt>How it is worked out</dt><dd>{s.formula}</dd>
                <dt>Assumptions</dt><dd>{s.assumptionsText}</dd>
                <dt>Sources</dt><dd>{s.sources}</dd>
              </dl>
              <div className="btn-row">
                <button className="btn primary" onClick={() => setTab(s.tab)}>Open this step</button>
                <button className="btn" onClick={() => setTab('assumptions')}>View assumptions</button>
              </div>
            </div>
          );
        })()}
      </Card>

      <div className="grid-3">
        <Card title="Emissions today">
          <div className="big">{fmt0(invTotals.gross)} <span className="unit">t CO₂e/yr</span></div>
          <p className="small">Methane is {inventory.length ? ((inventory.find((l) => l.id === 'methane')!.tCO2e / Math.max(1, invTotals.gross)) * 100).toFixed(0) : 0}% of it. Factors could move this between {fmt0(invTotals.low)} and {fmt0(invTotals.high)}.</p>
          <button className="btn" onClick={() => setTab('inventory')}>See the breakdown</button>
        </Card>
        <Card title="Net-zero year">
          <div className="big">{yearText(active.neutralityYear, opts.horizonEnd)}</div>
          <p className="small">Likely range {rangeText(mc, opts.horizonEnd)}. That is the middle 80% of {mc.iterations.toLocaleString('en-IN')} simulated futures; {(mc.probNotReached * 100).toFixed(0)}% do not get there by {opts.horizonEnd}.</p>
          <button className="btn" onClick={() => setTab('uncertainty')}>Why a range?</button>
        </Card>
        <Card title="How much of this is verified?">
          <div className="trustbar" role="img" aria-label={`${verifiedCount} verified, ${demoCount} demo`}>
            <i className="v" style={{ width: `${(verifiedCount / assumptions.factors.length) * 100}%` }} />
          </div>
          <p className="small"><b>{verifiedCount}</b> factors have a real source. <b>{demoCount}</b> are labelled demo values and must be replaced before any real-world use.</p>
          <button className="btn" onClick={() => setTab('assumptions')}>Check the sources</button>
        </Card>
      </div>

      <Card title={`What closes the gap in ${opts.horizonEnd}? (${activeScenario.name.split('—')[0].trim()})`} subtitle="Real cuts, land removals and bought credits are always kept apart, so credits cannot hide behind real reductions.">
        <ul className="funnel">
          {funnel.map((f) => (
            <li key={f.label}>
              <span className="fun-label">{f.label}</span>
              <span className="fun-bar"><i style={{ width: `${Math.max(1, (f.v / funMax) * 100)}%`, background: f.color }} /></span>
              <span className="fun-val">{fmt0(f.v)} t <Badge kind="info">{f.tag}</Badge></span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Open-cast vs underground, at a glance" subtitle="Underground mines are far gassier, so methane dominates. Open-cast emissions lean on diesel and electricity.">
        <div className="vs">
          {compare.map((c) => {
            const top = SOURCE_ORDER.reduce((a, s) => ((c.row[`${s}_pct`] as number) > (c.row[`${a}_pct`] as number) ? s : a), SOURCE_ORDER[0]);
            return (
              <div key={c.t} className={`vs-card ${c.t === state.mineType ? 'sel' : ''}`}>
                <div className="vs-name">{c.row.name as string}</div>
                <div className="vs-num">{fmt3(c.row.intensity as number)}<span> t CO₂e per tonne of coal</span></div>
                <p className="small">Biggest source: <b>{SOURCE_LABELS[top].toLowerCase()}</b> ({(c.row[`${top}_pct`] as number).toFixed(0)}%). Methane is {c.methaneShare.toFixed(0)}% of the total.</p>
              </div>
            );
          })}
        </div>
        <Legend items={SOURCE_ORDER.map((s) => ({ label: SOURCE_LABELS[s], color: SOURCE_COLORS[s] }))} />
        <div className="grid-2">
          <div>
            <h4 className="chart-title">Underground emissions are mostly methane; open-cast leans on fuel and power (share of gross, %)</h4>
            <div className="chart" style={{ height: 190 }}>
              <ResponsiveContainer>
                <BarChart data={shareData} layout="vertical" stackOffset="expand" margin={{ left: 20, right: 16 }}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} stroke={C.axis} />
                  <YAxis type="category" dataKey="name" width={90} stroke={C.axis} />
                  <Tooltip content={<ChartTip unit="%" format={(v) => v.toFixed(1)} note="Share of Scope 1+2 gross emissions." />} />
                  {SOURCE_ORDER.map((s) => (
                    <Bar isAnimationActive={false} key={s} dataKey={s} name={SOURCE_LABELS[s]} stackId="a" fill={SOURCE_COLORS[s]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h4 className="chart-title">Emissions per tonne of coal vs the {lo}–{hi} range quoted in the brief (tCO₂e/t)</h4>
            <div className="chart" style={{ height: 190 }}>
              <ResponsiveContainer>
                <BarChart data={intData} layout="vertical" margin={{ left: 20, right: 16 }}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 0.6]} stroke={C.axis} tickFormatter={(v: number) => v.toFixed(1)} />
                  <YAxis type="category" dataKey="name" width={90} stroke={C.axis} />
                  <ReferenceArea x1={lo} x2={hi} fill={C.band} fillOpacity={0.25} />
                  <Tooltip content={<ChartTip unit="tCO₂e/t" format={fmt3} note="Shaded band = plausibility range quoted in the hackathon brief (unverified)." />} />
                  {SOURCE_ORDER.map((s) => (
                    <Bar isAnimationActive={false} key={s} dataKey={s} name={SOURCE_LABELS[s]} stackId="b" fill={SOURCE_COLORS[s]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Mine</th>
                <th className="num">Coal (t/yr)</th>
                <th className="num">Gross Scope 1+2 (tCO₂e)</th>
                <th className="num">Intensity (t/t)</th>
                <th className="num">Methane share</th>
                <th className="num">Net zero ({'Scenario B'})</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((c) => (
                <tr key={c.t} className={c.t === state.mineType ? 'row-on' : ''}>
                  <td>{c.row.name}{c.t === state.mineType && <span className="muted xsmall"> (selected)</span>}</td>
                  <td className="num">{fmt0(c.coal)}</td>
                  <td className="num strong">{fmt0(c.tot.gross)}</td>
                  <td className="num">{fmt3(c.row.intensity as number)}</td>
                  <td className="num">{c.methaneShare.toFixed(0)}%</td>
                  <td className="num">{c.sim.neutralityYear ?? `>${opts.horizonEnd}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xsmall muted">Illustrative sample data with demo-assumption factors. Net-zero years use each mine’s own Scenario B settings and rely on credits (offsets) for the remainder.</p>
      </Card>

      <Glossary />
    </div>
  );
}

export type { SourceKey };

const TERMS: { term: string; plain: string; more: string }[] = [
  { term: 'Scope 1', plain: 'Emissions the mine makes itself.', more: 'Diesel burned in trucks and machines, explosives, and methane released from the coal seam.' },
  { term: 'Scope 2', plain: 'Emissions from electricity the mine buys.', more: 'The power plant emits it, but the mine’s demand causes it. Uses the grid emission factor.' },
  { term: 'tCO₂e', plain: 'Tonnes of CO₂-equivalent: one unit for all greenhouse gases.', more: 'Methane is stronger than CO₂, so it is multiplied by its warming potential (GWP).' },
  { term: 'Net zero', plain: 'Emissions minus removals minus credits is zero or less.', more: 'MinePath also shows the year without credits, because credits are not real reductions.' },
  { term: 'Carbon credit', plain: 'Paying someone else to cut or remove emissions.', more: 'Useful for the last, hard-to-cut part, but it should not replace real cuts.' },
  { term: 'P10–P90', plain: 'The middle 80% of simulated outcomes.', more: 'We run the plan thousands of times with slightly different assumptions. 10% finish earlier than P10, 10% later than P90.' },
];

function Glossary() {
  return (
    <Card title="Plain-words guide" subtitle="Technical terms, explained. Open any one for more.">
      <div className="gloss">
        {TERMS.map((g) => (
          <details key={g.term}>
            <summary><b>{g.term}</b> <span className="muted">{g.plain}</span></summary>
            <p className="small">{g.more}</p>
          </details>
        ))}
      </div>
    </Card>
  );
}
