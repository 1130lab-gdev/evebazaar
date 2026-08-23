import { useEffect, useState } from 'react';
import { useSystems } from '../../api/map/useSystems';
import { LocationPicker } from '../arbitrage/LocationPicker';
import type { ArbitrageSecurityProfile, Hauler, HaulerRequest } from '../../api/catalog/types';

const emptyForm: HaulerRequest = {
  name: '',
  cargo_capacity_m3: 0,
  isk_available: 0,
  route_security_profile: null,
  home_system_id: null,
};

/** Same form for create (no `editing` hauler) and edit (an existing one) --
 * resets its fields whenever the target hauler changes. */
export function HaulerForm({
  editing,
  onSubmit,
  onCancel,
}: {
  editing: Hauler | null;
  onSubmit: (req: HaulerRequest) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<HaulerRequest>(editing ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { systems } = useSystems();

  useEffect(() => {
    setForm(editing ?? emptyForm);
    setError(null);
  }, [editing]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
      if (!editing) setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hauler.');
    } finally {
      setSaving(false);
    }
  }

  const valid = form.name.trim().length > 0 && form.cargo_capacity_m3 > 0 && form.isk_available >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Name</label>
        <input type="text" placeholder="e.g. Iteron V" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Cargo capacity, m³</label>
        <input
          type="number"
          value={form.cargo_capacity_m3 || ''}
          onChange={(e) => setForm({ ...form, cargo_capacity_m3: Number(e.target.value) })}
        />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>ISK available</label>
        <input
          type="number"
          value={form.isk_available || ''}
          onChange={(e) => setForm({ ...form, isk_available: Number(e.target.value) })}
        />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Route security preference</label>
        <select
          value={form.route_security_profile ?? ''}
          onChange={(e) =>
            setForm({ ...form, route_security_profile: (e.target.value || null) as ArbitrageSecurityProfile | null })
          }
        >
          <option value="">fewest jumps (default)</option>
          <option value="high_sec_only">high_sec_only</option>
          <option value="low_sec_plus">low_sec_plus</option>
        </select>
        <p className="field-help" style={{ margin: '6px 0 0' }}>
          Default route spec for this hauler in the Route Planner (and, once selected, the Arbitrage scanner) --
          overridable per-search, still editable here any time.
        </p>
      </div>
      <LocationPicker
        label="Home system"
        systems={systems}
        selectedId={form.home_system_id}
        onChange={(id) => setForm({ ...form, home_system_id: id })}
      />
      <p className="field-help" style={{ margin: '-6px 0 0' }}>
        Auto-fills the Route Planner's "buy from" system (and the Arbitrage scanner's "from location") once selected
        -- e.g. Jita, if that's where this hauler is based.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--primary" disabled={!valid || saving} onClick={submit}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add hauler'}
        </button>
        {editing && onCancel && (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
