import { getFactor, methaneFactorId, unitsFor, type ValidationIssue } from '../engine';
import { useCtx } from '../lib/context';
import { Badge, Card, Check, NumField, Notice, UnitField } from '../components/ui';
import { fmt0, fmt2 } from '../lib/format';

export default function InputsTab() {
  const { inputs, patchInputs, validation, norm, assumptions, resetMine, mineType } = useCtx();
  const issuesFor = (field: string): ValidationIssue[] => validation.issues.filter((i) => i.field === field);
  const ch4 = getFactor(assumptions, methaneFactorId(mineType));

  return (
    <div className="stack">
      <Notice kind="demo">
        The preloaded values are <b>illustrative, invented activity data</b>, not a real mine. Edit any field and every table and chart updates immediately. Invalid values are flagged and treated as 0 until fixed.
      </Notice>

      <div className="grid-2">
        <Card
          title="Mine profile"
          right={
            <button className="btn" onClick={() => window.confirm('Reset this mine’s inputs and scenarios to the illustrative sample?') && resetMine()}>
              Reset to sample
            </button>
          }
        >
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Mine name</span>
              <input type="text" value={inputs.name} onChange={(e) => patchInputs({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Mine type</span>
              <input type="text" readOnly value={mineType === 'opencast' ? 'Open-cast' : 'Underground'} />
              <span className="hint">Switch type with the toggle in the header. Each type keeps its own edits.</span>
            </label>
            <UnitField
              label="Annual coal production"
              value={inputs.coal}
              units={unitsFor('coal')}
              perYear
              onChange={(coal) => patchInputs({ coal })}
              issues={issuesFor('coal')}
            />
            <NumField
              label="Annual production change"
              value={inputs.productionGrowthPct}
              unit="% / yr"
              step={0.5}
              hint="Scales all activity data year on year (default 0)."
              onChange={(v) => patchInputs({ productionGrowthPct: v })}
              issues={issuesFor('productionGrowthPct')}
            />
          </div>
        </Card>

        <Card title="Fuel, energy and explosives" subtitle="Scope 1 and Scope 2 activity data">
          <div className="form-grid">
            <UnitField
              label="Diesel for excavation & haulage"
              value={inputs.diesel}
              units={unitsFor('diesel')}
              perYear
              onChange={(diesel) => patchInputs({ diesel })}
              issues={issuesFor('diesel')}
            />
            <NumField label="Equipment operating hours" value={inputs.equipmentHours} unit="h / yr" onChange={(v) => patchInputs({ equipmentHours: v })} issues={issuesFor('equipmentHours')} />
            <NumField
              label="Equipment fuel use"
              value={inputs.equipmentFuelRate}
              unit="L / h"
              hint={`Equipment diesel = ${fmt0(norm.equipmentHours)} h × ${fmt2(norm.equipmentFuelRate)} L/h = ${fmt0(norm.equipmentL)} L/yr`}
              onChange={(v) => patchInputs({ equipmentFuelRate: v })}
              issues={issuesFor('equipmentFuelRate')}
            />
            <UnitField
              label="Purchased electricity"
              value={inputs.electricity}
              units={unitsFor('electricity')}
              perYear
              onChange={(electricity) => patchInputs({ electricity })}
              issues={issuesFor('electricity')}
            />
            <UnitField
              label="Explosives"
              value={inputs.explosives}
              units={unitsFor('explosives')}
              perYear
              onChange={(explosives) => patchInputs({ explosives })}
              issues={issuesFor('explosives')}
            />
          </div>
        </Card>

        <Card title="Fugitive methane and capture" subtitle="Underground mines are far gassier than open-cast">
          <div className="form-grid">
            <NumField
              label="Measured methane intensity (optional override)"
              value={inputs.methaneOverride}
              unit="kg CH₄ / t coal"
              placeholder={`default ${ch4.value}`}
              hint={
                <>
                  Leave blank to use the {mineType === 'underground' ? 'underground' : 'open-cast'} default of <b>{ch4.value} kg CH₄/t</b>{' '}
                  <Badge kind={ch4.status === 'verified' ? 'ok' : 'demo'}>{ch4.status === 'verified' ? 'verified' : 'demo assumption'}</Badge>
                </>
              }
              onChange={(v) => patchInputs({ methaneOverride: v })}
              issues={issuesFor('methaneOverride')}
            />
            <div className="field">
              <Check
                label="Methane capture is available at this mine"
                checked={inputs.captureAvailable}
                onChange={(v) => patchInputs({ captureAvailable: v })}
                hint="If unavailable, the capture lever has no effect."
              />
            </div>
            <NumField
              label="Capture rate at full adoption"
              value={inputs.captureRate}
              unit="% of fugitive methane"
              min={0}
              max={100}
              onChange={(v) => patchInputs({ captureRate: v })}
              hint="Applied on top of the system's destruction efficiency (see Assumptions)."
              issues={issuesFor('captureRate')}
            />
          </div>
        </Card>

        <Card title="Land, sinks and scope" subtitle="Removals are always shown separately from gross emissions">
          <div className="form-grid">
            <NumField label="Reclaimed / afforested area (existing)" value={inputs.reclaimedHa} unit="ha" onChange={(v) => patchInputs({ reclaimedHa: v })} issues={issuesFor('reclaimedHa')} />
            <NumField
              label="Age of existing plantation"
              value={inputs.plantationAge}
              unit="years in base year"
              onChange={(v) => patchInputs({ plantationAge: v })}
              hint="Sets where on the growth curve the existing area starts."
              issues={issuesFor('plantationAge')}
            />
            <NumField
              label="Soil-carbon estimate (optional)"
              value={inputs.soilCarbon}
              unit="tCO₂e / yr"
              hint={<Badge kind="est">Estimate, not measured</Badge>}
              onChange={(v) => patchInputs({ soilCarbon: v })}
              issues={issuesFor('soilCarbon')}
            />
            <div className="field">
              <Check label="Include soil-carbon estimate in removals" checked={inputs.includeSoil} onChange={(v) => patchInputs({ includeSoil: v })} hint="Shown as a distinct, hatched series; scaled by the soil-carbon confidence range." />
              <Check label="Show Scope 3 memo estimate" checked={inputs.includeScope3} onChange={(v) => patchInputs({ includeScope3: v })} hint="Memo only. Never included in the inventory or net-zero year." />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Normalised inputs (base units used by the engine)">
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Quantity</th>
                <th className="num">Value</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Coal production</td><td className="num">{fmt0(norm.coalT)}</td><td>t/yr</td></tr>
              <tr><td>Diesel (excavation & haulage)</td><td className="num">{fmt0(norm.dieselL)}</td><td>L/yr</td></tr>
              <tr><td>Equipment diesel</td><td className="num">{fmt0(norm.equipmentL)}</td><td>L/yr</td></tr>
              <tr><td>Purchased electricity</td><td className="num">{fmt0(norm.electricityKWh)}</td><td>kWh/yr</td></tr>
              <tr><td>Explosives</td><td className="num">{fmt0(norm.explosivesKg)}</td><td>kg/yr</td></tr>
              <tr><td>Methane capture rate</td><td className="num">{fmt2(norm.captureRate * 100)}</td><td>% (usable: {norm.captureAvailable ? 'yes' : 'no'})</td></tr>
              <tr><td>Existing reclaimed area</td><td className="num">{fmt0(norm.reclaimedHa)}</td><td>ha (age {fmt0(norm.plantationAge)} yr)</td></tr>
            </tbody>
          </table>
        </div>
        {validation.issues.length === 0 && <p className="muted small">All inputs valid.</p>}
      </Card>
    </div>
  );
}
