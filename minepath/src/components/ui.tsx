import type { ReactNode } from 'react';
import type { FactorStatus, Quantity, ValidationIssue } from '../engine';
import { fmt0 } from '../lib/format';

export function Card(props: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${props.className ?? ''}`}>
      {(props.title || props.right) && (
        <header className="card-head">
          <div>
            {props.title && <h3>{props.title}</h3>}
            {props.subtitle && <p className="muted small">{props.subtitle}</p>}
          </div>
          {props.right && <div className="card-right">{props.right}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function Badge(props: { kind?: 'demo' | 'est' | 'ok' | 'warn' | 'info' | 'err'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${props.kind ?? 'info'}`} title={props.title}>
      {props.children}
    </span>
  );
}

export function StatusBadge({ status }: { status: FactorStatus }) {
  return status === 'verified' ? (
    <Badge kind="ok">Verified source</Badge>
  ) : (
    <Badge kind="demo" title="Demo assumption. Replace with a verified factor before relying on results.">
      Demo assumption
    </Badge>
  );
}

export function Kpi(props: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'band' }) {
  return (
    <div className={`kpi kpi-${props.tone ?? 'default'}`}>
      <div className="kpi-label">{props.label}</div>
      <div className="kpi-value">{props.value}</div>
      {props.sub && <div className="kpi-sub">{props.sub}</div>}
    </div>
  );
}

function Issues({ issues }: { issues?: ValidationIssue[] }) {
  if (!issues || issues.length === 0) return null;
  return (
    <>
      {issues.map((i, k) => (
        <div key={k} className={`issue issue-${i.level}`} role={i.level === 'error' ? 'alert' : undefined}>
          {i.level === 'error' ? '⛔ ' : '⚠ '}
          {i.message}
        </div>
      ))}
    </>
  );
}

export function NumField(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  hint?: ReactNode;
  issues?: ValidationIssue[];
  step?: number | string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <span className="field-row">
        <input
          type="number"
          inputMode="decimal"
          step={props.step ?? 'any'}
          min={props.min}
          max={props.max}
          value={props.value === null || Number.isNaN(props.value) ? '' : props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value === '' ? null : Number(e.target.value))}
          aria-invalid={props.issues?.some((i) => i.level === 'error') || undefined}
        />
        {props.unit && <span className="unit">{props.unit}</span>}
      </span>
      {props.hint && <span className="hint">{props.hint}</span>}
      <Issues issues={props.issues} />
    </label>
  );
}

export function UnitField(props: {
  label: string;
  value: Quantity;
  units: string[];
  perYear?: boolean;
  onChange: (q: Quantity) => void;
  hint?: ReactNode;
  issues?: ValidationIssue[];
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <span className="field-row">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={props.value.value === null || Number.isNaN(props.value.value) ? '' : props.value.value}
          onChange={(e) => props.onChange({ ...props.value, value: e.target.value === '' ? null : Number(e.target.value) })}
          aria-invalid={props.issues?.some((i) => i.level === 'error') || undefined}
        />
        <select
          className="unit-select"
          value={props.value.unit}
          onChange={(e) => props.onChange({ ...props.value, unit: e.target.value })}
          aria-label={`${props.label} unit`}
        >
          {props.units.map((u) => (
            <option key={u} value={u}>
              {u}
              {props.perYear ? ' / yr' : ''}
            </option>
          ))}
        </select>
      </span>
      {props.hint && <span className="hint">{props.hint}</span>}
      <Issues issues={props.issues} />
    </label>
  );
}

export function Check(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`check ${props.disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span>
        {props.label}
        {props.hint && <span className="hint block">{props.hint}</span>}
      </span>
    </label>
  );
}

/** Custom Recharts tooltip: lists every series value with units and an optional assumption note. */
export function ChartTip(props: {
  active?: boolean;
  payload?: { name?: string; value?: number | [number, number]; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }[];
  label?: string | number;
  unit?: string;
  note?: string;
  labelPrefix?: string;
  hide?: string[];
  format?: (v: number) => string;
}) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const f = props.format ?? fmt0;
  return (
    <div className="tip">
      {props.label !== undefined && (
        <div className="tip-title">
          {props.labelPrefix ?? ''}
          {props.label}
        </div>
      )}
      {props.payload
        .filter((p) => !(props.hide ?? []).includes(String(p.dataKey)))
        .map((p, i) => {
          const v = p.value;
          const text = Array.isArray(v) ? `${f(v[0])} to ${f(v[1])}` : typeof v === 'number' ? f(v) : String(v ?? '');
          return (
            <div key={i} className="tip-row">
              <span className="dot" style={{ background: p.color }} />
              <span className="tip-name">{p.name ?? String(p.dataKey)}</span>
              <span className="tip-val">
                {text} {props.unit ?? ''}
              </span>
            </div>
          );
        })}
      {props.note && <div className="tip-note">{props.note}</div>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; hatch?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label} className="legend-item">
          <span
            className={`swatch ${it.dashed ? 'dashed' : ''} ${it.hatch ? 'hatch' : ''}`}
            style={it.dashed ? { borderColor: it.color } : { background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function Notice(props: { kind?: 'info' | 'warn' | 'demo'; children: ReactNode }) {
  return <div className={`notice notice-${props.kind ?? 'info'}`}>{props.children}</div>;
}
