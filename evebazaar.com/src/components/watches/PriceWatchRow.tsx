import { useState } from 'react';
import type { PriceWatch } from '../../api/catalog/types';
import { formatIsk, formatDateTime } from '../../lib/format';
import { ItemInfoIcon } from '../ui/ItemInfoIcon';

export function PriceWatchRow({
  watch,
  onSave,
  onDelete,
}: {
  watch: PriceWatch;
  onSave: (referencePrice: number, thresholdPct: number) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [referencePrice, setReferencePrice] = useState(String(watch.reference_price));
  const [thresholdPct, setThresholdPct] = useState(String(watch.threshold_pct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerPrice = watch.reference_price * (1 + watch.threshold_pct / 100);

  function startEdit() {
    setReferencePrice(String(watch.reference_price));
    setThresholdPct(String(watch.threshold_pct));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(Number(referencePrice), Number(thresholdPct));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="panel panel--tight"
      style={{
        marginBottom: 10,
        ...(watch.triggered ? { outline: '1px solid var(--accent-red)', outlineOffset: -1 } : {}),
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong>
            {watch.type_name}
            <ItemInfoIcon typeId={watch.type_id} typeName={watch.type_name} />
          </strong>
          <div className="text-muted mono" style={{ fontSize: 11, marginTop: 2 }}>
            watching since {formatDateTime(watch.created_at)}
          </div>
        </div>

        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: watch.triggered ? 'var(--accent-red)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {watch.triggered ? '● Triggered' : '○ Watching'}
        </span>
      </div>

      {!editing ? (
        <>
          <div className="mono" style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap', fontSize: 12 }}>
            <span className="text-muted">
              Reference: <span style={{ color: 'var(--text-primary)' }}>{formatIsk(watch.reference_price)}</span>
            </span>
            <span className="text-muted">
              Alert above ({watch.threshold_pct}%): <span style={{ color: 'var(--text-primary)' }}>{formatIsk(triggerPrice)}</span>
            </span>
            <span className={watch.triggered ? 'text-buy' : 'text-muted'}>
              Current best buy: {watch.current_price !== null ? formatIsk(watch.current_price) : 'no live buy orders'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={startEdit}>
              Edit
            </button>
            <button className="btn btn--danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onDelete}>
              Delete
            </button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Reference price, ISK</label>
              <input type="number" value={referencePrice} onChange={(e) => setReferencePrice(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Alert threshold, %</label>
              <input type="number" step="any" value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="btn btn--primary"
              style={{ padding: '4px 10px', fontSize: 11 }}
              disabled={saving || Number(referencePrice) <= 0 || Number(thresholdPct) < 0}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
