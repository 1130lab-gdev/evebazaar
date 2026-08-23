import { useEffect, useState } from 'react';
import { useRuns } from '../../api/catalog/useRuns';
import type { ArbitrageOpportunity, Hauler } from '../../api/catalog/types';

/** Pins a single selected arbitrage opportunity to a hauler as a
 * one-leg run -- same "Save as run" action the Route Planner offers per
 * candidate itinerary (see haulers/RoutePlanCard.tsx), but for a single
 * buy-low-sell-high pairing picked straight off the scanner. Quantity is
 * left unset so catalog-api auto-sizes it against the hauler's cargo/ISK
 * at save time (see routes/haulers.rs's `CreateRunLegRequest::quantity`). */
export function SaveOpportunityAsRun({ opportunity, haulers }: { opportunity: ArbitrageOpportunity; haulers: Hauler[] }) {
  const [haulerId, setHaulerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createRun } = useRuns(haulerId);

  useEffect(() => {
    setSaved(false);
    setError(null);
  }, [opportunity.type_id, opportunity.buy_system_id, opportunity.sell_system_id]);

  async function handleSave() {
    if (haulerId === null) return;
    setSaving(true);
    setError(null);
    try {
      await createRun({
        legs: [
          {
            type_id: opportunity.type_id,
            buy_system_id: opportunity.buy_system_id,
            sell_system_id: opportunity.sell_system_id,
          },
        ],
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save run.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
      <select
        value={haulerId ?? ''}
        style={{ width: 'auto' }}
        onChange={(e) => {
          setHaulerId(e.target.value === '' ? null : Number(e.target.value));
          setSaved(false);
        }}
      >
        <option value="">— select a hauler to save as a run —</option>
        {haulers.map((h) => (
          <option key={h.hauler_id} value={h.hauler_id}>
            {h.name}
          </option>
        ))}
      </select>
      <button className="btn btn--primary" style={{ padding: '6px 12px', fontSize: 11 }} disabled={haulerId === null || saving || saved} onClick={handleSave}>
        {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save as run'}
      </button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
