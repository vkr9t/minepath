import { useMemo, useRef, useState } from 'react';
import { useCtx } from '../lib/context';
import { Badge, Card, Notice, StatusBadge } from '../components/ui';
import type { Assumptions, FactorRecord } from '../engine';

const MODEL_NOTES = [
  'Net emissions = gross Scope 1+2 − estimated removals − credits. Gross emissions are never reduced by sinks or credits; they are reported separately everywhere.',
  'Net-zero year = the first year with annual net emissions ≤ 0 after estimated removals and credits. A second figure excludes credits, because offsets are not emission reductions.',
  'A lever ramps linearly: its effect begins in the start year and reaches its adoption level in the full-effect year.',
  'Fleet electrification shifts the same share of haulage and equipment diesel to electricity and adds grid demand (kWh per litre displaced), so Scope 2 can rise.',
  'Methane capture destroys fugitive methane by (capture rate × destruction efficiency × lever ramp). It does nothing if capture is marked unavailable.',
  'Renewable PPA removes its adoption share of purchased electricity emissions (including electricity added by an electric fleet).',
  'Sinks use a Chapman–Richards stock curve per planting cohort; annual removal is the year-on-year change in stock, times survival. Soil carbon is a user estimate scaled by a confidence multiplier.',
  'Capex is spent in proportion to ramp growth; costs are placeholders. MAC = present-value cost ÷ discounted tCO₂e abated, each lever alone vs a no-lever baseline.',
  'Monte Carlo samples every uncertain parameter once per run from a triangular distribution (low, central, high) and re-runs the whole deterministic engine.',
  'Production change scales all activity data uniformly. The grid factor falls by the configured percentage per year.',
  'Scope 3 is an optional memo item and is never part of the inventory or the net-zero calculation.',
];

export default function AssumptionsTab() {
  const { assumptions, patchFactor, resetAssumptions, replaceAssumptions } = useCtx();
  const [cat, setCat] = useState('All');
  const [status, setStatus] = useState<'all' | 'verified' | 'demo_assumption'>('all');
  const [q, setQ] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const all = assumptions.factors;
  const cats = useMemo(() => Array.from(new Set(all.map((f) => f.category))), [all]);
  const needle = q.trim().toLowerCase();
  const matches = (f: FactorRecord) =>
    (cat === 'All' || f.category === cat) &&
    (status === 'all' || f.status === status) &&
    (needle === '' || [f.name, f.id, f.notes, f.sourceName, f.category, f.unit].join(' ').toLowerCase().includes(needle));
  const rows = all.filter(matches);
  const demo = all.filter((f) => f.status === 'demo_assumption').length;
  const verified = all.length - demo;
  const searching = needle !== '' || status !== 'all' || cat !== 'All';
  const grouped = cats.map((c) => ({ cat: c, items: rows.filter((f) => f.category === c), total: all.filter((f) => f.category === c) })).filter((g) => g.items.length > 0);

  const num = (v: string): number | null => (v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  const download = () => {
    const blob = new Blob([JSON.stringify(assumptions, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'minepath-assumptions.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Assumptions;
      if (!Array.isArray(parsed.factors) || typeof parsed.baseYear !== 'number') throw new Error('Expected { baseYear, horizonEnd, factors: [...] }');
      const have = new Set(parsed.factors.map((f) => f.id));
      const missing = assumptions.factors.filter((f) => !have.has(f.id));
      replaceAssumptions({ ...parsed, factors: [...parsed.factors, ...missing] });
      setImportMsg(`Imported ${parsed.factors.length} factors${missing.length ? `; kept ${missing.length} existing ones that the file lacked` : ''}.`);
    } catch (e) {
      setImportMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  const setAll = (open: boolean) => {
    const g: Record<string, boolean> = {};
    cats.forEach((c) => (g[c] = open));
    setOpenGroups(g);
  };

  return (
    <div className="stack">
      <Card title="How much of this can you trust?" subtitle="Green rows have a real source you can open. Amber rows with a dashed edge are demo values: they keep the tool running but must be replaced before any real-world use.">
        <div className="ax-summary">
          <div>
            <div className="trustbar" role="img" aria-label={`${verified} verified, ${demo} demo`}><i className="v" style={{ width: `${(verified / all.length) * 100}%` }} /></div>
            <p className="small"><b>{verified}</b> verified · <b>{demo}</b> demo assumptions · {all.length} total. None of the demo values is an official IPCC or CEA number.</p>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={download}>Export JSON</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>Import JSON</button>
            <button className="btn" onClick={() => window.confirm('Restore all assumptions to the shipped values?') && resetAssumptions()}>Reset to defaults</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </div>
        </div>
        {importMsg && <Notice kind="info">{importMsg}</Notice>}
        <details>
          <summary>How to verify a demo value</summary>
          <p className="small">Find the value in a primary source, then open that factor’s details: enter the value and its low/high range, fill in the source name, link and year, and set the status to “verified source”. Every result in the app updates straight away.</p>
        </details>
      </Card>

      <Card title="Find a factor" subtitle={`${rows.length} of ${all.length} shown. Edits recalculate the whole app and are saved in this browser.`}>
        <div className="filters">
          <input type="search" placeholder="Search by name, source, unit or note…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search factors" style={{ maxWidth: 420, minHeight: 40 }} />
          <div className="seg small-seg" role="group" aria-label="Filter by status">
            {([['all', 'All'], ['verified', 'Verified'], ['demo_assumption', 'Demo']] as const).map(([k, l]) => (
              <button key={k} className={status === k ? 'on' : ''} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => setAll(true)}>Expand all</button>
            <button className="btn" onClick={() => setAll(false)}>Collapse all</button>
          </div>
        </div>
        <div className="ax-chips" role="group" aria-label="Filter by category">
          <button className={`chip ${cat === 'All' ? 'on' : ''}`} aria-pressed={cat === 'All'} onClick={() => setCat('All')}>All<span className="ct">{all.length}</span></button>
          {cats.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}<span className="ct">{all.filter((f) => f.category === c).length}</span></button>
          ))}
        </div>
        <p className="xsmall muted">Years: base {assumptions.baseYear}, horizon end {assumptions.horizonEnd}. Defaults live in <code>src/config/assumptions.json</code>.</p>

        {grouped.length === 0 ? (
          <div className="empty" role="status">
            <b>No factors match.</b>
            <p className="small">Try a shorter search or clear the filters.</p>
            <button className="btn" onClick={() => { setQ(''); setCat('All'); setStatus('all'); }}>Clear filters</button>
          </div>
        ) : (
          <div className="stack">
            {grouped.map((g) => {
              const gv = g.total.filter((f) => f.status === 'verified').length;
              const isOpen = searching ? true : !!openGroups[g.cat];
              return (
                <details key={g.cat} className="ax-group" open={isOpen} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (!searching && o !== !!openGroups[g.cat]) setOpenGroups((s) => ({ ...s, [g.cat]: o })); }}>
                  <summary>
                    <span><b>{g.cat}</b> <span className="muted small">{g.items.length} factor{g.items.length > 1 ? 's' : ''}</span></span>
                    <span className="small">{gv > 0 && <Badge kind="ok">{gv} verified</Badge>}<Badge kind="demo">{g.total.length - gv} demo</Badge></span>
                  </summary>
                  {g.items.map((f) => (
                    <FactorRow key={f.id} f={f} patch={(p) => patchFactor(f.id, p)} num={num} open={!!openRows[f.id]} toggle={() => setOpenRows((s) => ({ ...s, [f.id]: !s[f.id] }))} />
                  ))}
                </details>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Model notes and simplifications" subtitle="How the calculations behave, in short">
        <ul className="notes">
          {MODEL_NOTES.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function FactorRow({ f, patch, num, open, toggle }: { f: FactorRecord; patch: (p: Partial<FactorRecord>) => void; num: (v: string) => number | null; open: boolean; toggle: () => void }) {
  const hasRange = f.category !== 'Cost' && f.category !== 'Validation';
  const isDemo = f.status === 'demo_assumption';
  return (
    <div className={`ax-row ${isDemo ? 'demo' : 'ver'}`}>
      <div className="ax-main">
        <div>
          <div className="ax-name">{f.name}</div>
          <StatusBadge status={f.status} />
        </div>
        <div className="ax-val">
          <input type="number" step="any" value={f.value} onChange={(e) => num(e.target.value) !== null && patch({ value: num(e.target.value) as number })} aria-label={`${f.name} value`} />
          <span className="small muted">{f.unit}</span>
        </div>
        <div className="ax-src">{isDemo ? 'Demo assumption, no source yet' : `${f.sourceName}${f.year ? ` (${f.year})` : ''}`}</div>
        <button className="ax-toggle" aria-expanded={open} aria-controls={`ax-${f.id}`} onClick={toggle}>{open ? 'Hide details' : 'Details'}</button>
      </div>
      {open && (
        <div id={`ax-${f.id}`} className="ax-detail">
          {isDemo && <div className="ax-warn full"><b>Replace before real-world use.</b> This is a demo assumption, not an official value.</div>}
          <label>Low (uncertainty)
            {hasRange ? <input type="number" step="any" value={f.low ?? ''} onChange={(e) => patch({ low: num(e.target.value) })} /> : <span className="muted">Not used for this factor</span>}
          </label>
          <label>High (uncertainty)
            {hasRange ? <input type="number" step="any" value={f.high ?? ''} onChange={(e) => patch({ high: num(e.target.value) })} /> : <span className="muted">Not used for this factor</span>}
          </label>
          <label>Status
            <select value={f.status} onChange={(e) => patch({ status: e.target.value as FactorRecord['status'] })}>
              <option value="demo_assumption">Demo assumption</option>
              <option value="verified">Verified source</option>
            </select>
          </label>
          <label>Source name
            <input type="text" value={f.sourceName} onChange={(e) => patch({ sourceName: e.target.value })} />
          </label>
          <label>Source link
            <input type="text" placeholder="https://…" value={f.sourceUrl} onChange={(e) => patch({ sourceUrl: e.target.value })} />
          </label>
          <label>Year
            <input type="number" value={f.year ?? ''} onChange={(e) => patch({ year: num(e.target.value) })} />
          </label>
          {f.sourceUrl && (
            <div className="full small">
              <a href={f.sourceUrl} target="_blank" rel="noreferrer noopener">{isDemo ? 'Where to look up a verified value ↗' : 'Open the source ↗'}</a>
            </div>
          )}
          <div className="full small"><b>Notes:</b> {f.notes}</div>
          <div className="full xsmall muted">Used as <code>{f.id}</code> · {f.geography}</div>
        </div>
      )}
    </div>
  );
}
